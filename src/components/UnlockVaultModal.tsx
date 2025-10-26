// src/components/UnlockVaultModal.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";

export default function UnlockVaultModal() {
  const { user, userBase } = useAuth();
  const { unlocked, unlocking, unlockWithPassphrase, createInitialVaultWithPassphrase } = useCrypto();
  const [hasPassWrap, setHasPassWrap] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState("");

  useEffect(() => {
    (async () => {
      if (!user || !userBase) return;
      const { data: v } = await supabase.rpc("active_tmk_version");
      const activeVersion: number | null = v ?? null;
      if (!activeVersion) { setHasPassWrap(false); return; }
      const { data: wraps } = await supabase.rpc("get_my_tmk_wraps");
      const has = (wraps as any[] | null)?.some(r => r.tmk_version === activeVersion && r.device_bound === false);
      setHasPassWrap(!!has);
    })();
  }, [user?.id, userBase?.client_id]);

  if (unlocked) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (hasPassWrap) await unlockWithPassphrase(pass);
      else await createInitialVaultWithPassphrase(pass);
    } catch (err: any) {
      setError(err.message || "Erreur");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-2">{hasPassWrap ? "Déverrouiller le coffre" : "Créer le coffre du cabinet"}</h2>
        <p className="text-sm text-gray-600 mb-4">
          {hasPassWrap
            ? "Entrez votre code secret pour déchiffrer les données."
            : (userBase?.type_utilisateur === "admin"
              ? "Définissez le code secret initial de chiffrement (vous pourrez activer la biométrie plus tard)."
              : "Le coffre n’est pas encore initialisé. Demandez à un admin de l’initialiser.")}
        </p>

        {(hasPassWrap || userBase?.type_utilisateur === "admin") && (
          <>
            <input
              type="password"
              className="w-full border rounded-lg p-2 mb-3"
              placeholder="Code secret"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
            />
            {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
            <button
              disabled={unlocking || (!pass)}
              className="w-full rounded-lg bg-teal-600 text-white py-2 disabled:opacity-60"
            >
              {unlocking ? "..." : hasPassWrap ? "Déverrouiller" : "Créer et ouvrir"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
