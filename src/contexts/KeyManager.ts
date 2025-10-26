// src/contexts/KeyManager.ts
import { createContext, useContext, useState } from "react";
import { kdfToKEK, unwrapDEK, KekParams, generateDEK, wrapDEK } from "../utils/zkcrypto";
import { supabase } from "../lib/supabase";

type KeyState = {
  dek: CryptoKey | null;
};

const KeyContext = createContext<{
  dek: CryptoKey | null;
  deriveAndLoad: (password: string, userId: string) => Promise<void>;
  initializeForNewUser: (password: string, userId: string, existingWrappedDek?: ArrayBuffer) => Promise<void>;
  clear: () => void;
}>({
  dek: null,
  deriveAndLoad: async () => {},
  initializeForNewUser: async () => {},
  clear: () => {},
});

export function KeyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<KeyState>({ dek: null });

  const deriveAndLoad = async (password: string, userId: string) => {
    const { data: km, error } = await supabase
      .from("user_key_materials")
      .select("kdf_salt, dek_wrapped, kek_params")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !km) throw error ?? new Error("NO_KEY_MATERIAL");

    const salt = new Uint8Array(km.kdf_salt as number[]);
    const wrapped = new Uint8Array(km.dek_wrapped as number[]).buffer;
    const params = km.kek_params as KekParams;

    const KEK = await kdfToKEK(password, salt, params);
    const DEK = await unwrapDEK(KEK, wrapped);
    setState({ dek: DEK });
  };

  const initializeForNewUser = async (password: string, userId: string, existingWrappedDek?: ArrayBuffer) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const params: KekParams = { algo: "argon2id", ops: 3, mem: 1 << 20, parallelism: 1, version: 1 }; // ajuste mem/ops
    const KEK = await kdfToKEK(password, salt, params);

    let DEK: CryptoKey;
    if (existingWrappedDek) {
      DEK = await unwrapDEK(KEK, existingWrappedDek);
    } else {
      DEK = await generateDEK();
    }
    const wrapped = await wrapDEK(KEK, DEK);

    await supabase.from("user_key_materials").upsert({
      user_id: userId,
      kdf_salt: Array.from(new Uint8Array(salt)),
      dek_wrapped: Array.from(new Uint8Array(wrapped)),
      kek_params: params,
    });

    setState({ dek: DEK });
  };

  const clear = () => setState({ dek: null });

  return (
    <KeyContext.Provider value={{ dek: state.dek, deriveAndLoad, initializeForNewUser, clear }}>
      {children}
    </KeyContext.Provider>
  );
}
export const useKeys = () => useContext(KeyContext);
