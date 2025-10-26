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
  kdfPBKDF2,  // tu peux monter à 600_000 itérations côté cryptoClient.ts si tu veux
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

function toU8(v: any): Uint8Array {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;
  // PostgREST peut renvoyer { type: 'Buffer', data: [...] }
  if (typeof v === "object" && "type" in v && v.type === "Buffer" && Array.isArray((v as any).data)) {
    return new Uint8Array((v as any).data);
  }
  if (Array.isArray(v)) return new Uint8Array(v as number[]);
  if (typeof v === "string") {
    // essaye base64/base64url
    let s = v.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    s = s + "=".repeat(pad);
    try {
      const bstr = atob(s);
      const arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) arr[i] = bstr.charCodeAt(i);
      return arr;
    } catch {
      console.error("toU8: string not base64/b64url decodable");
      return new Uint8Array();
    }
  }
  console.error("toU8: unsupported type", typeof v, v);
  return new Uint8Array();
}

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user, userBase } = useAuth();
  const [{ tmk, version, unlocking }, setState] = useState<{
    tmk: Uint8Array | null;
    version: number | null;
    unlocking: boolean;
  }>({ tmk: null, version: null, unlocking: false });

  // Reset coffre en changeant d’utilisateur/tenant
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

      const salt = toU8(row.salt);
      const { kek } = await kdfPBKDF2(pin6, salt);

      const wrap = toU8(row.tmk_wrap);
      const iv = wrap.slice(0, 12);
      const ct = wrap.slice(12);
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);

      const tmkRaw = await unwrapWithKEK(kek, iv, ct, aad);
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
      const { data: vActive, error: eActive } = await supabase.rpc("active_tmk_version");
      if (eActive) throw eActive;
      const activeVersion: number | null = vActive ?? null;
      if (!activeVersion) throw new Error("La TMK n'est pas initialisée. Un administrateur doit créer la version active.");

      const tmk = randomBytes(32);
      const salt = randomBytes(16);
      const { kek, params } = await kdfPBKDF2(pin6, salt);

      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);
      const { iv, ct } = await wrapWithKEK(kek, tmk, aad);
      const wrap = new Uint8Array(iv.length + ct.length);
      wrap.set(iv, 0);
      wrap.set(ct, iv.length);

      const wrapArr = Array.from(wrap);
      const saltArr = Array.from(salt);

      const { error } = await supabase.rpc("upsert_my_tmk_wrap", {
        p_tmk_version: activeVersion,
        p_tmk_wrap: wrapArr as any,
        p_wrap_alg: "AES-GCM",
        p_kdf_params: params,
        p_salt: saltArr as any,
        p_device_bound: false,
        p_device_id: null,
      });
      if (error) {
        console.error("upsert_my_tmk_wrap error:", error);
        throw error;
      }

      setState({ tmk, version: activeVersion, unlocking: false });
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
