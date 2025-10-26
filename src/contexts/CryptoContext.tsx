// src/contexts/CryptoContext.tsx
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

/** Convertit divers formats (Uint8Array, number[], {type:"Buffer",data}, hex \x..., base64url) en Uint8Array */
function toU8(v: any): Uint8Array {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;

  // { type: 'Buffer', data: [...] }
  if (typeof v === "object" && (v as any).type === "Buffer" && Array.isArray((v as any).data)) {
    return new Uint8Array((v as any).data);
  }

  // number[]
  if (Array.isArray(v)) return new Uint8Array(v as number[]);

  // string: hex ("\x...") ou base64/base64url
  if (typeof v === "string") {
    // hex postgres
    if (v.startsWith("\\x")) {
      const hex = v.slice(2);
      if (hex.length % 2 !== 0) return new Uint8Array();
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return out;
    }
    // base64/base64url
    let s = v.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    s = s + "=".repeat(pad);
    try {
      const bstr = atob(s);
      const arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) arr[i] = bstr.charCodeAt(i);
      return arr;
    } catch {
      console.error("toU8: chaîne non décodable (ni hex ni base64)");
      return new Uint8Array();
    }
  }

  console.error("toU8: type non supporté", typeof v, v);
  return new Uint8Array();
}

/** Récupère proprement kdf_params depuis la ligne RPC (objet ou JSON string) */
function parseKdfParams(raw: any): { kdf: string; iters?: number } {
  let obj: any = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const kdf = (obj?.kdf || "pbkdf2").toLowerCase();
  const iters = Number(obj?.iters ?? obj?.iterations ?? NaN);
  return { kdf, iters: Number.isFinite(iters) ? iters : undefined };
}

/** Encodage base64 sûr pour envoi RPC */
function bytesToB64(u8: Uint8Array): string {
  // btoa sur string binaire
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

/** MAGIC header pour valider le plaintext déchiffré */
const MAGIC = new TextEncoder().encode("VAULTv1"); // 7 octets; versionnable

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user, userBase } = useAuth();
  const [{ tmk, version, unlocking }, setState] = useState<{
    tmk: Uint8Array | null;
    version: number | null;
    unlocking: boolean;
  }>({ tmk: null, version: null, unlocking: false });

  // Reset coffre quand l'utilisateur/tenant change
  useEffect(() => {
    setState({ tmk: null, version: null, unlocking: false });
  }, [user?.id, userBase?.client_id]);

  const unlockWithPassphrase = async (pin6: string) => {
    if (!user || !userBase) return;
    if (!/^\d{6}$/.test(pin6)) throw new Error("Le code secret doit contenir exactement 6 chiffres.");

    setState((s) => ({ ...s, unlocking: true }));
    try {
      // 1) Version active
      const { data: vActive, error: eActive } = await supabase.rpc("active_tmk_version");
      if (eActive) throw eActive;
      const activeVersion: number | null = vActive ?? null;
      if (!activeVersion) throw new Error("Aucune TMK active. Demandez à un administrateur d'initialiser le coffre.");

      // 2) Enveloppes de l'utilisateur
      const { data: wraps, error: eWraps } = await supabase.rpc("get_my_tmk_wraps");
      if (eWraps) throw eWraps;

      const row = (wraps as any[] | null)?.find(
        (r) => r.tmk_version === activeVersion && r.device_bound === false
      );
      if (!row) throw new Error("Aucune enveloppe TMK liée à votre code secret.");

      // 3) KDF params EXACTS utilisés à la création
      const { kdf, iters } = parseKdfParams(row.kdf_params);
      const salt = toU8(row.salt);
      if (salt.length < 8) console.warn("Salt inhabituel (court):", salt.length);

      if (kdf !== "pbkdf2") {
        throw new Error(`KDF non supporté: ${kdf}. (Attendu: pbkdf2)`);
      }
      const { kek } = await kdfPBKDF2(pin6, salt, iters || 310_000);

      // 4) Déchiffrage payload et validation MAGIC
      const wrap = toU8(row.tmk_wrap);
      if (wrap.length < 28) {
        console.error("Wrap trop court:", { wrapLen: wrap.length, row });
        throw new Error("Données de clé invalides (wrap incomplet).");
      }
      const iv = wrap.slice(0, 12);
      const ct = wrap.slice(12);
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);

      const payload = await unwrapWithKEK(kek, iv, ct, aad); // <- devrait rendre MAGIC||TMK
      if (payload.length < MAGIC.length + 32) {
        throw new Error("Code secret incorrect (payload trop court).");
      }
      // Vérif MAGIC
      for (let i = 0; i < MAGIC.length; i++) {
        if (payload[i] !== MAGIC[i]) throw new Error("Code secret incorrect.");
      }
      const tmkRaw = payload.slice(MAGIC.length, MAGIC.length + 32);

      console.log("[Crypto] Unlocked: payloadLen=", payload.length, "tmkLen=", tmkRaw.length);
      setState({ tmk: tmkRaw, version: activeVersion, unlocking: false });
    } catch (err) {
      console.error("unlockWithPassphrase error:", err);
      setState((s) => ({ ...s, unlocking: false }));
      throw err;
    }
  };

  const createInitialVaultWithPassphrase = async (pin6: string) => {
    if (!user || !userBase) return;
    if (!/^\d{6}$/.test(pin6)) throw new Error("Le code secret doit contenir exactement 6 chiffres.");

    setState((s) => ({ ...s, unlocking: true }));
    try {
      console.log("[Crypto] Create: start");
      // 1) S'assurer qu'une version active existe (et la créer si besoin)
      let { data: vActive, error: eActive } = await supabase.rpc("active_tmk_version");
      if (eActive) throw eActive;
      let activeVersion: number | null = vActive ?? null;

      if (!activeVersion) {
        console.log("[Crypto] No active version -> rotate");
        const { data: vNew, error: eNew } = await supabase.rpc("rotate_tmk_version");
        if (eNew) throw eNew;
        activeVersion = (vNew ?? null) as number | null;

        // relire par sécurité
        if (!activeVersion) {
          const { data: vAgain, error: eAgain } = await supabase.rpc("active_tmk_version");
          if (eAgain) throw eAgain;
          activeVersion = vAgain ?? null;
        }
      }

      if (!activeVersion) {
        throw new Error("Impossible d'initialiser la TMK (version active absente).");
      }
      console.log("[Crypto] Active version =", activeVersion);

      // 2) Génère TMK + KEK (PIN)
      const tmk = randomBytes(32);
      const salt = randomBytes(16);
      const iterations = 310_000; // durcissable à 600_000
      const { kek } = await kdfPBKDF2(pin6, salt, iterations);
      const kdfParams = { kdf: "pbkdf2", iters: iterations };
      console.log("[Crypto] KDF ok (iters=", iterations, "), saltLen=", salt.length);

      // 3) Construire payload = MAGIC || TMK
      const payload = new Uint8Array(MAGIC.length + tmk.length);
      payload.set(MAGIC, 0);
      payload.set(tmk, MAGIC.length);

      // 4) Envelopper (iv || ct) avec AAD
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);
      const { iv, ct } = await wrapWithKEK(kek, payload, aad);
      if (!(iv instanceof Uint8Array) || !(ct instanceof Uint8Array)) {
        throw new Error("wrapWithKEK a retourné des iv/ct invalides.");
      }
      const wrap = new Uint8Array(iv.length + ct.length);
      wrap.set(iv, 0);
      wrap.set(ct, iv.length);

      console.log("[Crypto] Wrapped: ivLen=", iv.length, "ctLen=", ct.length, "wrapLen=", wrap.length);

      // 5) RPC upsert en **base64** (fiable)
      const wrapB64 = bytesToB64(wrap);
      const saltB64 = bytesToB64(salt);

      const { error } = await supabase.rpc("upsert_my_tmk_wrap_b64", {
        p_tmk_version: activeVersion,
        p_tmk_wrap_b64: wrapB64,
        p_wrap_alg: "AES-GCM",
        p_kdf_params: kdfParams, // { kdf:"pbkdf2", iters }
        p_salt_b64: saltB64,
        p_device_bound: false,
        p_device_id: null,
      });
      if (error) {
        console.error("upsert_my_tmk_wrap_b64 error:", error);
        throw error;
      }
      console.log("[Crypto] RPC upsert_my_tmk_wrap_b64 ok");

      // 6) Pose en mémoire
      setState({ tmk, version: activeVersion, unlocking: false });
      console.log("[Crypto] Created + unlocked, tmkLen=", tmk.length);
    } catch (err) {
      console.error("createInitialVaultWithPassphrase error:", err);
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
