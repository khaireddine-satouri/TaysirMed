// src/crypto/CryptoContext.tsx
import { createContext, useContext, useMemo, useState } from "react";
import { AesKey, deriveKeyFromPassphrase, randomSalt } from "./crypto";

type CryptoCtx = {
  ready: boolean;
  key: AesKey | null;
  ensureKey: () => Promise<void>;
  setLocked: () => void;
};

const CryptoContext = createContext<CryptoCtx>({
  ready: false,
  key: null,
  ensureKey: async () => {},
  setLocked: () => {},
});

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<AesKey | null>(null);
  const [salt] = useState<Uint8Array>(() => randomSalt()); // sel éphémère par session
  const [showUnlock, setShowUnlock] = useState(false);

  async function ensureKey() {
    if (key) return;
    setShowUnlock(true);
    // l’UI va appeler resolveUnlock une fois le passphrase saisi
  }

  async function resolveUnlock(passphrase: string) {
    const k = await deriveKeyFromPassphrase(passphrase, salt);
    setKey(k);
    setShowUnlock(false);
  }

  function setLocked() {
    setKey(null);
    setShowUnlock(true);
  }

  const value = useMemo(() => ({ ready: !!key, key, ensureKey, setLocked }), [key]);

  return (
    <CryptoContext.Provider value={value}>
      {children}
      {showUnlock && (
        <UnlockModal
          onCancel={() => setShowUnlock(false)}
          onUnlock={resolveUnlock}
        />
      )}
    </CryptoContext.Provider>
  );
}

export const useCrypto = () => useContext(CryptoContext);

function UnlockModal({ onUnlock, onCancel }: { onUnlock: (p: string) => void; onCancel: () => void }) {
  const [p, setP] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (!p.trim()) {
        setErr("Entrez une phrase secrète.");
        setLoading(false);
        return;
      }
      await onUnlock(p);
    } catch (e: any) {
      setErr(e?.message || "Erreur de déverrouillage.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Déverrouiller les données</h3>
        <p className="text-sm text-gray-600">
          Saisissez votre phrase secrète pour déchiffrer les informations sensibles.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            placeholder="Phrase secrète"
            className="w-full px-3 py-2 border rounded-lg"
            autoFocus
          />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="px-3 py-2 border rounded-lg">Annuler</button>
            <button type="submit" disabled={loading} className="px-3 py-2 bg-teal-600 text-white rounded-lg">
              {loading ? "Déverrouillage…" : "Déverrouiller"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
