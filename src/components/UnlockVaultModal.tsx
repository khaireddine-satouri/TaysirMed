// src/components/UnlockVaultModal.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";

export default function UnlockVaultModal() {
  const { user, userBase } = useAuth();
  const {
    unlocked,
    unlocking,
    unlockWithPassphrase,
    createInitialVaultWithPassphrase,
  } = useCrypto();

  const [hasPassWrap, setHasPassWrap] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const isAdmin = userBase?.type_utilisateur === "admin";

  useEffect(() => {
    (async () => {
      if (!user || !userBase) return;
      setError(null);
      setHasPassWrap(null); // indique "chargement"

      // 1) Version active ?
      const { data: v, error: eV } = await supabase.rpc("active_tmk_version");
      if (eV) {
        console.error("active_tmk_version error:", eV);
        setError(eV.message);
        setHasPassWrap(null);
        return;
      }
      const activeVersion: number | null = v ?? null;

      if (!activeVersion) {
        // pas de TMK : mode création (admin)
        setHasPassWrap(false);
        return;
      }

      // 2) Enveloppe passphrase pour cette version ?
      const { data: wraps, error: eW } = await supabase.rpc("get_my_tmk_wraps");
      if (eW) {
        console.error("get_my_tmk_wraps error:", eW);
        setError(eW.message);
        setHasPassWrap(null);
        return;
      }
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

    if (!/^\d{6}$/.test(pin)) {
      setError("Le code secret doit contenir exactement 6 chiffres.");
      return;
    }

    // Empêche toute action tant que nous ne savons pas si une enveloppe existe
    if (hasPassWrap === null) return;

    try {
      if (hasPassWrap === true) {
        await unlockWithPassphrase(pin);
        return;
      }

      // Pas d’enveloppe => création initiale (réservée admin)
      if (!isAdmin) {
        setError(
          "Le coffre n'est pas encore initialisé. Un administrateur doit d'abord l'initialiser."
        );
        return;
      }

      // S'assurer qu'une version est active ; si elle n'existe pas, on la crée (RPC SECURITY DEFINER)
      const { data: active, error: eAct } = await supabase.rpc("active_tmk_version");
      if (eAct) throw eAct;

      if (!active) {
        const { error: eNew } = await supabase.rpc("rotate_tmk_version");
        if (eNew) throw eNew;
      }

      await createInitialVaultWithPassphrase(pin);
    } catch (err: any) {
      console.error("UnlockVaultModal onSubmit error:", err);
      setError(err?.message || "Erreur");
    }
  };

  const showCreate = hasPassWrap === false;
  const isLoadingState = hasPassWrap === null || unlocking;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
      >
        <h2 className="text-xl font-semibold mb-2">
          {showCreate ? "Créer le coffre du cabinet" : "Déverrouiller le coffre"}
        </h2>

        <div className="mb-3 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 p-3 text-sm">
          <strong>Important :</strong> choisissez un code <strong>à 6 chiffres</strong> et
          mémorisez-le. Il n’est <em>pas</em> stocké côté serveur. Sans ce code, les données
          chiffrées ne peuvent pas être récupérées.
        </div>

        {/* Champ PIN + bouton */}
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
          disabled={isLoadingState}
        />

        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}

        <button
          type="submit"
          disabled={isLoadingState || pin.length !== 6}
          className="w-full rounded-lg bg-teal-600 text-white py-2 disabled:opacity-60"
        >
          {isLoadingState ? "..." : showCreate ? "Créer et ouvrir" : "Déverrouiller"}
        </button>

        {/* Indication de statut */}
        {hasPassWrap === null && (
          <p className="text-xs text-gray-500 mt-2">Vérification du coffre…</p>
        )}

        {showCreate && !isAdmin && (
          <p className="text-xs text-gray-500 mt-2">
            Seul un administrateur peut initialiser le coffre. Contactez votre
            administrateur.
          </p>
        )}
      </form>
    </div>
  );
}
