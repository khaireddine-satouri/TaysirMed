// src/contexts/KeyManager.tsx
// Gestion des clés côté client : garde la DEK en mémoire, jamais persistée.

import { createContext, useContext, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  anyToU8,
  kdfToKEK,
  unwrapDEK,
  wrapDEK,
  generateDEK,
  KekParams,
} from "../utils/zkcrypto";

type KeyContextType = {
  dek: CryptoKey | null;
  zkReady: boolean; // true si DEK chargée (utile pour bloquer l'UI chiffrée)
  deriveAndLoad: (password: string, userId: string) => Promise<void>;
  initializeForNewUser: (
    password: string,
    userId: string,
    existingWrappedDek?: ArrayBuffer
  ) => Promise<void>;
  clear: () => void;
};

const KeyContext = createContext<KeyContextType>({
  dek: null,
  zkReady: false,
  deriveAndLoad: async () => {},
  initializeForNewUser: async () => {},
  clear: () => {},
});

export function KeyProvider({ children }: { children: React.ReactNode }) {
  const [dek, setDek] = useState<CryptoKey | null>(null);

  const deriveAndLoad = async (password: string, userId: string) => {
    // On récupère le matériel (bytea -> hex string "\\x..")
    const { data, error } = await supabase
      .from("user_key_materials")
      .select("kdf_salt, dek_wrapped, kek_params")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("NO_KEY_MATERIAL");

    const salt = anyToU8(data.kdf_salt);
    const wrapped = anyToU8(data.dek_wrapped).buffer;
    const params = (data.kek_params ?? {
      algo: "argon2id",
      ops: 3,
      mem: 1 << 20,
      parallelism: 1,
      version: 1,
    }) as KekParams;

    const KEK = await kdfToKEK(password, salt, params);
    const DEK = await unwrapDEK(KEK, wrapped);
    setDek(DEK);
  };

  const initializeForNewUser = async (
    password: string,
    userId: string,
    existingWrappedDek?: ArrayBuffer
  ) => {
    // paramètres par défaut (augmente mem/ops si device costaud)
    const params: KekParams = {
      algo: "argon2id",
      ops: 3,
      mem: 1 << 20, // 1 MiB; vise 64-256 MiB si acceptable
      parallelism: 1,
      version: 1,
    };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const KEK = await kdfToKEK(password, salt, params);

    let DEK: CryptoKey;
    if (existingWrappedDek) {
      DEK = await unwrapDEK(KEK, existingWrappedDek);
    } else {
      DEK = await generateDEK();
    }
    const wrapped = await wrapDEK(KEK, DEK);

    // upsert user_key_materials
    const { error } = await supabase.from("user_key_materials").upsert(
      {
        user_id: userId,
        kdf_salt: salt,         // PostgREST accepte Uint8Array → bytea
        dek_wrapped: new Uint8Array(wrapped),
        kek_params: params,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    setDek(DEK);
  };

  const clear = () => setDek(null);

  const value = useMemo<KeyContextType>(
    () => ({
      dek,
      zkReady: !!dek,
      deriveAndLoad,
      initializeForNewUser,
      clear,
    }),
    [dek]
  );

  return <KeyContext.Provider value={value}>{children}</KeyContext.Provider>;
}

export const useKeys = () => useContext(KeyContext);
