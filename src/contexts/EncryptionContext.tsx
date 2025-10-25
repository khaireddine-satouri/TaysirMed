// src/contexts/EncryptionContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { bootstrapDEK, clearDEKInMemory } from "../crypto/KeyService";
import { encryptText, decryptToText, encryptBytes, decryptBytes } from "../crypto/EncryptionService";

type EncryptionContextType = {
  ready: boolean;
  error: string | null;
  ensureReady: () => Promise<void>;
  encryptText: (s: string) => Promise<Uint8Array>;
  decryptToText: (b: Uint8Array) => Promise<string>;
  encryptBytes: (b: Uint8Array) => Promise<Uint8Array>;
  decryptBytes: (b: Uint8Array) => Promise<Uint8Array>;
};

const EncryptionContext = createContext<EncryptionContextType>({
  ready: false,
  error: null,
  ensureReady: async () => {},
  encryptText: async () => { throw new Error("Encryption not ready"); },
  decryptToText: async () => { throw new Error("Encryption not ready"); },
  encryptBytes: async () => { throw new Error("Encryption not ready"); },
  decryptBytes: async () => { throw new Error("Encryption not ready"); },
});

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const init = async () => {
    setErr(null);
    const res = await bootstrapDEK();
    if (res.status === "error") {
      setErr(res.message);
      setReady(false);
    } else {
      setReady(true);
    }
  };

  useEffect(() => {
    // Au mount, si session existante -> bootstrap
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await init();
      }
    })();

    // Sur changement d’auth : re-bootstrap au login, purge au logout
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        setReady(false);
        await init();
      } else if (event === "SIGNED_OUT") {
        clearDEKInMemory();
        setReady(false);
        setErr(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: EncryptionContextType = useMemo(
    () => ({
      ready,
      error: err,
      ensureReady: async () => {
        if (!ready) await init();
        if (!ready && err) throw new Error(err);
      },
      encryptText,
      decryptToText,
      encryptBytes,
      decryptBytes,
    }),
    [ready, err]
  );

  return <EncryptionContext.Provider value={value}>{children}</EncryptionContext.Provider>;
}

export const useEncryption = () => useContext(EncryptionContext);
