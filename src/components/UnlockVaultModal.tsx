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
  const [pin, setPin] = useState("");

  const isAdmin = userBase?.type_utilisateur === "admin";

  useEffect(() => {
    (async () => {
      if (!user || !userBase) return;
      setError(null);
      const { data: v } = await supabase.rpc("active_tmk_version");
      const activeVersion: number | null = v ?? null;

      if (!activeVersion) {
        // il n’y a pas encore de TMK: seul un admin pourra la créer
        setHasPassWrap(false);
        return;
      }
      const { data: wraps } = await supabase.rpc("get_my_tmk_wraps");
      const has = (wraps as any[] | null)?.some(
        (r) => r.tmk_version === activeVersion && r.device_bound === false
      );
      setHasPassWrap(!!has);
    })();
  }, [user?.id, userBase?.client_id]);

  if (unlocked || !user || !userBase) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // hard check PIN 6 chiffres
    if (!/^\d{6}$/.test(pin)) {
      setError("Le code secret doit contenir exactement 6 chiffres.");
      return;
    }

    try {
      if (hasPassWrap) {
        await unlockWithPassphrase(pin);
      } else {
        // Si aucune TMK active: seul un admin peut créer la v1 + l’enveloppe
        if (!isAdmin) {
          setError("Le coffre n'est pas encore initialisé. Un administrateur doit d'abord l'initialiser.");
          return;
        }
        // s'assure que v1 existe (si besoin)
        await supabase.rpc("rotate_tmk_version").catch(() => {});
        await createInitialVaultWithPassphrase(pin);
      }
    } catch (err: any) {
      setError(err?.message || "Erreur");
    }
  };

  const showCreate = hasPassWrap === false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-2">
          {showCreate ? "Créer le coffre du cabinet" : "Déverrouiller le coffre"}
        </h2>

        {/* Alerte mémorisation */}
        <div className="mb-3 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 p-3 text-sm">
          <strong>Important :</strong> choisissez un code <strong>à 6 chiffres</strong> et mémorisez-le.
          Il n’est <em>pas</em> stocké côté serveur. Sans ce code, les données chiffrées ne peuvent pas être récupérées.
        </div>

        {/* Champ PIN 6 chiffres */}
        {(showCreate || hasPassWrap) && (
          <>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="Code secret (6 chiffres)"
              className="w-full border rounded-lg p-2 mb-3 tracking-widest text-center text-lg"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
            />
            {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
            <button
              type="submit"
              disabled={unlocking || pin.length !== 6}
              className="w-full rounded-lg bg-teal-600 text-white py-2 disabled:opacity-60"
            >
              {unlocking ? "..." : showCreate ? "Créer et ouvrir" : "Déverrouiller"}
            </button>

            {/* Info admin si coffre non initialisé */}
            {showCreate && !isAdmin && (
              <p className="text-xs text-gray-500 mt-2">
                Seul un administrateur peut initialiser le coffre. Contactez votre administrateur.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
