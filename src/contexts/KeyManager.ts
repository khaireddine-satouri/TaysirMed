import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import {
  kdfPBKDF2,       // (pass, salt, iterations?)
  wrapWithKEK,
  unwrapWithKEK,
  randomBytes,
} from "../lib/cryptoClient";
import { useAuth } from "./AuthContext";

type CryptoCtx = {
  unlocked: boolean;
  unlocking: boolean;
  tmk: Uint8Array | null;
  tmkVersion: number | null;
  unlockWithPassphrase: (pin6: string) => Promise<void>;
  createInitialVaultWithPassphrase: (pin6: string) => Promise<void>;
  lock: () => void;
};

const CryptoContext = createContext<CryptoCtx>({
  unlocked: false,
  unlocking: false,
  tmk: null,
  tmkVersion: null,
  unlockWithPassphrase: async () => {},
  createInitialVaultWithPassphrase: async () => {},
  lock: () => {},
});

/** toU8: convertit divers formats (Buffer, number[], hex \x..., base64/url) en Uint8Array */
function toU8(v: any): Uint8Array {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;
  if (typeof v === "object" && (v as any).type === "Buffer" && Array.isArray((v as any).data)) {
    return new Uint8Array((v as any).data);
  }
  if (Array.isArray(v)) return new Uint8Array(v as number[]);
  if (typeof v === "string") {
    if (v.startsWith("\\x")) {
      const hex = v.slice(2);
      if (hex.length % 2 !== 0) return new Uint8Array();
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      return out;
    }
    let s = v.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    s = s + "=".repeat(pad);
    try {
      const b = atob(s);
      const arr = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
      return arr;
    } catch { return new Uint8Array(); }
  }
  return new Uint8Array();
}

/** parseKdfParams: récupère kdf/iters depuis objet ou JSON string */
function parseKdfParams(raw: any): { kdf: string; iters?: number } {
  let obj: any = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { obj = {}; } }
  const kdf = (obj?.kdf || "pbkdf2").toLowerCase();
  const iters = Number(obj?.iters ?? obj?.iterations ?? NaN);
  return { kdf, iters: Number.isFinite(iters) ? iters : undefined };
}

/** base64 helper */
function bytesToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

/** MAGIC pour valider le plaintext déchiffré */
const MAGIC = new TextEncoder().encode("VAULTv1");

/** KCV = SHA-256("KCV:" || TMK) */
async function computeKcv(tmk: Uint8Array): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode("KCV:");
  const msg = new Uint8Array(prefix.length + tmk.length);
  msg.set(prefix, 0);
  msg.set(tmk, prefix.length);
  const digest = await crypto.subtle.digest("SHA-256", msg);
  return new Uint8Array(digest);
}

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user, userBase } = useAuth();
  const [{ tmk, version, unlocking }, setState] = useState<{
    tmk: Uint8Array | null;
    version: number | null;
    unlocking: boolean;
  }>({ tmk: null, version: null, unlocking: false });

  useEffect(() => {
    setState({ tmk: null, version: null, unlocking: false });
  }, [user?.id, userBase?.client_id]);

  const unlockWithPassphrase = async (pin6: string) => {
    if (!user || !userBase) return;
    if (!/^\d{6}$/.test(pin6)) throw new Error("Le code secret doit contenir exactement 6 chiffres.");

    setState((s) => ({ ...s, unlocking: true }));
    try {
      const { data: vActive, error: eActive } = await supabase.rpc("active_tmk_version");
      if (eActive) throw eActive;
      const activeVersion: number | null = vActive ?? null;
      if (!activeVersion) throw new Error("Aucune TMK active. Demandez à un administrateur d'initialiser le coffre.");

      const { data: wraps, error: eWraps } = await supabase.rpc("get_my_tmk_wraps");
      if (eWraps) throw eWraps;

      const row = (wraps as any[] | null)?.find(
        (r) => r.tmk_version === activeVersion && r.device_bound === false
      );
      if (!row) throw new Error("Aucune enveloppe TMK liée à votre code secret.");

      const { kdf, iters } = parseKdfParams(row.kdf_params);
      const salt = toU8(row.salt);
      if (kdf !== "pbkdf2") throw new Error(`KDF non supporté: ${kdf}. (Attendu: pbkdf2)`);
      const { kek } = await kdfPBKDF2(pin6, salt, iters || 310_000);

      const wrap = toU8(row.tmk_wrap);
      if (wrap.length < 28) throw new Error("Données de clé invalides (wrap incomplet).");
      const iv = wrap.slice(0, 12);
      const ct = wrap.slice(12);
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);

      const payload = await unwrapWithKEK(kek, iv, ct, aad);
      if (payload.length < MAGIC.length + 32) throw new Error("Code secret incorrect (payload trop court).");
      for (let i = 0; i < MAGIC.length; i++) {
        if (payload[i] !== MAGIC[i]) throw new Error("Code secret incorrect.");
      }
      const tmkRaw = payload.slice(MAGIC.length, MAGIC.length + 32);

      const kcvDb = toU8((row as any).kcv);
      if (kcvDb.length > 0) {
        const kcvLocal = await computeKcv(tmkRaw);
        if (kcvLocal.length !== kcvDb.length) throw new Error("Code secret incorrect (KCV size mismatch).");
        for (let i = 0; i < kcvDb.length; i++) {
          if (kcvLocal[i] !== kcvDb[i]) throw new Error("Code secret incorrect.");
        }
      }

      setState({ tmk: tmkRaw, version: activeVersion, unlocking: false });
    } catch (err) {
      setState((s) => ({ ...s, unlocking: false }));
      throw err;
    }
  };

  const createInitialVaultWithPassphrase = async (pin6: string) => {
    if (!user || !userBase) return;
    if (!/^\d{6}$/.test(pin6)) throw new Error("Le code secret doit contenir exactement 6 chiffres.");

    setState((s) => ({ ...s, unlocking: true }));
    try {
      let { data: vActive, error: eActive } = await supabase.rpc("active_tmk_version");
      if (eActive) throw eActive;
      let activeVersion: number | null = vActive ?? null;

      if (!activeVersion) {
        const { data: vNew, error: eNew } = await supabase.rpc("rotate_tmk_version");
        if (eNew) throw eNew;
        activeVersion = (vNew ?? null) as number | null;
        if (!activeVersion) {
          const { data: vAgain, error: eAgain } = await supabase.rpc("active_tmk_version");
          if (eAgain) throw eAgain;
          activeVersion = vAgain ?? null;
        }
      }
      if (!activeVersion) throw new Error("Impossible d'initialiser la TMK (version active absente).");

      const tmk = randomBytes(32);
      const salt = randomBytes(16);
      const iterations = 310_000;
      const { kek } = await kdfPBKDF2(pin6, salt, iterations);
      const kdfParams = { kdf: "pbkdf2", iters: iterations };

      const payload = new Uint8Array(MAGIC.length + tmk.length);
      payload.set(MAGIC, 0);
      payload.set(tmk, MAGIC.length);

      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);
      const { iv, ct } = await wrapWithKEK(kek, payload, aad);
      const wrap = new Uint8Array(iv.length + ct.length);
      wrap.set(iv, 0);
      wrap.set(ct, iv.length);

      const kcv = await computeKcv(tmk);
      const wrapB64 = bytesToB64(wrap);
      const saltB64 = bytesToB64(salt);
      const kcvB64  = bytesToB64(kcv);

      const { error } = await supabase.rpc("upsert_my_tmk_wrap_b64", {
        p_tmk_version: activeVersion,
        p_tmk_wrap_b64: wrapB64,
        p_wrap_alg: "AES-GCM",
        p_kdf_params: kdfParams,
        p_salt_b64: saltB64,
        p_device_bound: false,
        p_device_id: null,
        p_kcv_b64: kcvB64,
      });

      if (error) {
        if (String(error.message).includes("upsert_my_tmk_wrap_b64")) {
          // Fallback si la nouvelle RPC n'est pas encore dispo
          const wrapArr = Array.from(wrap);
          const saltArr = Array.from(salt);
          const { error: e2 } = await supabase.rpc("upsert_my_tmk_wrap", {
            p_tmk_version: activeVersion,
            p_tmk_wrap: wrapArr as any,
            p_wrap_alg: "AES-GCM",
            p_kdf_params: kdfParams,
            p_salt: saltArr as any,
            p_device_bound: false,
            p_device_id: null,
          });
          if (e2) throw e2;
        } else {
          throw error;
        }
      }

      setState({ tmk, version: activeVersion, unlocking: false });
    } catch (err) {
      setState((s) => ({ ...s, unlocking: false }));
      throw err;
    }
  };

  const lock = () => setState({ tmk: null, version: null, unlocking: false });

  const value = useMemo(
    () => ({
      unlocked: !!tmk,
      unlocking,
      tmk,
      tmkVersion: version,
      unlockWithPassphrase,
      createInitialVaultWithPassphrase,
      lock,
    }),
    [tmk, version, unlocking]
  );

  return (
    <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>
  );
}

export const useCrypto = () => useContext(CryptoContext);
