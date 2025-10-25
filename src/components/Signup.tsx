// src/components/Signup.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Stethoscope } from "lucide-react";

export default function Signup({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [typeClient, setTypeClient] = useState<"soignant" | "medecin">("soignant");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      // Étape 1 : création utilisateur Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nom,
            prenom,
            type_utilisateur: "admin",
            type_client: typeClient,
          },
        },
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error("Utilisateur non créé");

      // Étape 2 : créer client + lier user
      const { error: rpcError } = await supabase.rpc("bootstrap_create_client_for_current_user", {
        p_nom: nom,
        p_prenom: prenom,
      });
      if (rpcError) throw rpcError;

      // Message discret de succès
      setSuccess("Compte créé avec succès. Veuillez vérifier votre boîte mail pour valider votre inscription.");
    } catch (err: any) {
      console.error("Erreur signup:", err);
      setError(err.message || "Erreur lors de la création du compte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
              <Stethoscope className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Création de compte</h1>
            <p className="text-gray-600">Commencez à gérer votre cabinet en quelques secondes</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />
            </div>

            {/* Prénom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />
            </div>

            {/* Type de professionnel */}
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium">
                Type de professionnel <span className="text-red-500">*</span>
              </legend>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="type_client"
                    checked={typeClient === "soignant"}
                    onChange={() => setTypeClient("soignant")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Soignant paramédical</span>
                    <span className="block text-sm text-gray-600">
                      Gestion en temps réel des dossiers de soins, du suivi des séances et du personnel associé.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="type_client"
                    checked={typeClient === "medecin"}
                    onChange={() => setTypeClient("medecin")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Médecin</span>
                    <span className="block text-sm text-gray-600">
                      Gestion des dossiers médicaux, des rendez-vous et du personnel associé.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Création..." : "Créer mon compte"}
            </button>
          </form>

          {/* Switch */}
          <p className="text-center text-sm text-gray-600">
            Déjà un compte ?{" "}
            <button onClick={onSwitchToLogin} className="text-teal-600 hover:underline">
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
