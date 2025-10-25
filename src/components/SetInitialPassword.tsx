// src/components/SetInitialPassword.tsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function SetInitialPassword({
  onDone,
  mode, // "invite" | "recovery"
}: {
  onDone: () => void;
  mode: "invite" | "recovery";
}) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const label =
    mode === "invite" ? "Définir mon mot de passe" : "Définir un nouveau mot de passe";

  // ✅ On ne valide que l'égalité des deux mots de passe côté front.
  const invalidReason = useMemo(() => {
    if (password !== password2) return "Les mots de passe ne correspondent pas.";
    return "";
  }, [password, password2]);

  const disabled = loading || !!invalidReason || password.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (invalidReason) {
      setErr(invalidReason);
      return;
    }

    setLoading(true);
    try {
      // La session doit déjà être créée via setSession() après clic du lien (App.tsx)
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Mot de passe défini. Vous pouvez maintenant continuer.");
      // Nettoyer l’URL (#... tokens)
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
      }
      setTimeout(onDone, 800);
    } catch (e: any) {
      // Supabase retournera les messages (ex: contrainte de complexité, longueur, etc.)
      setErr(e?.message || "Erreur lors de la définition du mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{label}</h1>
          <p className="text-gray-600">
            {mode === "invite"
              ? "Bienvenue ! Veuillez choisir un mot de passe pour activer votre compte."
              : "Saisissez votre nouveau mot de passe pour retrouver l’accès à votre compte."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {err}
            </div>
          )}
          {msg && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : label}
          </button>
        </form>
      </div>
    </div>
  );
}
