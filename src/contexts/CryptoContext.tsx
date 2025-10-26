// src/contexts/CryptoContext.tsx
import { createContext, useContext, useMemo, useState, ReactNode, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { kdfPBKDF2, wrapWithKEK, unwrapWithKEK, randomBytes, bytesToB64u } from "../lib/cryptoClient";
import { useAuth } from "./AuthContext";

type TMKState = { tmk: Uint8Array | null; version: number | null; unlocking: boolean; };

type CryptoCtx = {
  unlocked: boolean;
  unlocking: boolean;
  tmk: Uint8Array | null;
  tmkVersion: number | null;
  unlockWithPassphrase: (passphrase: string) => Promise<void>;
  createInitialVaultWithPassphrase: (passphrase: string) => Promise<void>;
  lock: () => void;
};

const Ctx = createContext<CryptoCtx>({
  unlocked: false, unlocking: false, tmk: null, tmkVersion: null,
  unlockWithPassphrase: async () => {}, createInitialVaultWithPassphrase: async () => {}, lock: () => {}
});

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user, userBase, loading, signOut } = useAuth();
  const [{ tmk, version, unlocking }, setState] = useState<TMKState>({ tmk: null, version: null, unlocking: false });

  useEffect(() => {
    // réinitialise quand on change d’utilisateur
    setState({ tmk: null, version: null, unlocking: false });
  }, [user?.id, userBase?.client_id]);

  const unlockWithPassphrase = async (passphrase: string) => {
    if (!user || !userBase) return;
    setState(s => ({ ...s, unlocking: true }));
    try {
      // 1) quelle version active ?
      const { data: v } = await supabase.rpc("active_tmk_version");
      const activeVersion: number | null = v ?? null;
      if (!activeVersion) throw new Error("Aucune version TMK active");

      // 2) récupérer les enveloppes de l’utilisateur
      const { data: wraps, error: e1 } = await supabase.rpc("get_my_tmk_wraps");
      if (e1) throw e1;

      const row = (wraps as any[] | null)?.find(r => r.tmk_version === activeVersion && r.device_bound === false);
      if (!row) throw new Error("Aucune enveloppe TMK liée à la passphrase. (Il faut initialiser le coffre)");

      // 3) dériver KEK & dé-envelopper TMK
      const salt = new Uint8Array(row.salt as number[]);
      const { kek } = await kdfPBKDF2(passphrase, salt);
      const wrap = new Uint8Array(row.tmk_wrap as number[]);
      const iv = wrap.slice(0, 12);
      const ct = wrap.slice(12);
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);

      const tmkRaw = await unwrapWithKEK(kek, iv, ct, aad);
      setState({ tmk: tmkRaw, version: activeVersion, unlocking: false });
    } catch (err) {
      setState(s => ({ ...s, unlocking: false }));
      throw err;
    }
  };

  const createInitialVaultWithPassphrase = async (passphrase: string) => {
    if (!user || !userBase) return;
    setState(s => ({ ...s, unlocking: true }));
    try {
      // 1) s’assurer qu’il y a une version active (admin l’a normalement créée)
      let { data: v } = await supabase.rpc("active_tmk_version");
      let activeVersion: number | null = v ?? null;
      if (!activeVersion) {
        // fallback: si l’utilisateur est admin, il peut créer la v1
        const isAdmin = userBase.type_utilisateur === "admin";
        if (!isAdmin) throw new Error("TMK non initialisée — un admin doit l’initialiser.");
        const { data: nv } = await supabase.rpc("rotate_tmk_version");
        activeVersion = nv as number;
      }

      // 2) Générer TMK (32o) et KEK
      const tmk = randomBytes(32);
      const salt = randomBytes(16);
      const { kek, params } = await kdfPBKDF2(passphrase, salt);

      // 3) Envelopper TMK avec KEK (iv||ct stockés ensemble)
      const aad = new TextEncoder().encode(`${userBase.client_id}:${user.id}:${activeVersion}`);
      const { iv, ct } = await wrapWithKEK(kek, tmk, aad);
      const wrap = new Uint8Array(iv.length + ct.length);
      wrap.set(iv, 0); wrap.set(ct, iv.length);

      // 4) Pousser l’enveloppe en base
      const { error } = await supabase.rpc("upsert_my_tmk_wrap", {
        p_tmk_version: activeVersion,
        p_tmk_wrap: wrap,               // bytea
        p_wrap_alg: "AES-GCM",
        p_kdf_params: params,
        p_salt: salt,
        p_device_bound: false,
        p_device_id: null
      });
      if (error) throw error;

      setState({ tmk, version: activeVersion, unlocking: false });
    } catch (err) {
      setState(s => ({ ...s, unlocking: false }));
      throw err;
    }
  };

  const lock = () => setState({ tmk: null, version: null, unlocking: false });

  const value = useMemo(() => ({
    unlocked: !!tmk, unlocking, tmk, tmkVersion: version,
    unlockWithPassphrase,
    createInitialVaultWithPassphrase,
    lock
  }), [tmk, version, unlocking]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCrypto = () => useContext(Ctx);
