// src/components/UnlockVaultModal.tsx
import { useEffect, useMemo, useState } from "react";
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
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const isAdmin = userBase?.type_utilisateur === "admin";

  // Diagnostic compact pour affichage
  const diag = useMemo(() => {
    const parts: string[] = [];
    parts.push(`v=${activeVersion ?? "∅"}`);
    parts.push(`wrap=${hasPassWrap === null ? "?" : hasPassWrap ? "oui" : "non"}`);
    return parts.join(" • ");
  }, [activeVersion, hasPassWrap]);

  useEffect(() => {
    (async () => {
      if (!user || !userBase) return;
      setError(null);
      setHasPassWrap(null); // état "chargement"
      setActiveVersion(null);

      // 1) Version TMK active ?
      const { data: v, error: eV } = await supabase.rpc("active_tmk_version");
      if (eV) {
        console.error("active_tmk_version error:", eV);
        setError(eV.message);
        setHasPassWrap(null);
        return;
      }
      const vActive: number | null = v ?? null;
      setActiveVersion(vActive);

      if (!vActive) {
        // pas de TMK => création (admin)
        setHasPassWrap(false);
        return;
      }

      // 2) L'utilisateur possède-t-il une enveloppe passphrase pour cette version ?
      const { data: wraps, error: eW } = await supabase.rpc("get_my_tmk_wraps");
      if (eW) {
        console.error("get_my_tmk_wraps error:", eW);
        setError(eW.message);
        setHasPassWrap(null);
        return;
      }
      const has = (wraps as any[] | null)?.some(
        (r) => r.tmk_version === vActive && r.device_bound === false
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

    // Bloque tant qu'on ne sait pas s'il existe déjà une enveloppe
    if (hasPassWrap === null) return;

    try {
      // 1) Toujours tenter l'unlock d'abord
      await unlockWithPassphrase(pin);
      return;
    } catch (err: any) {
      const msg = String(err?.message || err);

      // 2) Si l'erreur est "pas d’enveloppe", on passe à la création (admin)
      const noWrap =
        msg.includes("Aucune enveloppe TMK") ||
        msg.includes("wrap incomplet") ||
        msg.toLowerCase().includes("no rows") ||
        msg.toLowerCase().includes("not found");

      if (noWrap) {
        if (!isAdmin) {
          setError("Le coffre n'est pas encore initialisé. Un administrateur doit d'abord l'initialiser.");
          return;
        }

        // Laisse le contexte créer/initialiser la version si absente
        try {
          await createInitialVaultWithPassphrase(pin);
          return;
        } catch (e2: any) {
          console.error("createInitialVaultWithPassphrase failed:", e2);
          setError(e2?.message || "Erreur lors de la création du coffre.");
          return;
        }
      }

      // 3) Autres erreurs => affiche
      console.error("unlockWithPassphrase failed:", err);
      setError(msg || "Erreur");
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

        {/* Petit diagnostic utile en dev (retirez en prod si vous voulez) */}
        <div className="text-xs text-gray-500 mb-2">état: {diag}</div>

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
