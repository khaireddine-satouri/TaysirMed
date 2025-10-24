import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Stethoscope } from "lucide-react";

interface SignupProps {
  onSwitchToLogin: () => void;
}

export default function Signup({ onSwitchToLogin }: SignupProps) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [typeClient, setTypeClient] = useState<"soignant" | "medecin">("soignant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nom,
            prenom,
            type_utilisateur: "admin", // premier utilisateur = admin
            type_client: typeClient,
          },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error("Inscription échouée");

      // Ensuite: appel RPC pour créer le client automatiquement
      const { error: rpcError } = await supabase.rpc("bootstrap_create_client_for_current_user", {
        p_nom: `Cabinet ${nom} ${prenom}`,
      });

      if (rpcError) {
        console.error("Erreur RPC client:", rpcError);
        setError("Erreur lors de la création du compte. Veuillez réessayer.");
      } else {
        alert("Compte créé avec succès, vous pouvez vous connecter.");
        onSwitchToLogin();
      }
    } catch (err: any) {
      setError(err.message || "Erreur inconnue lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
              <Stethoscope className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Création de compte</h1>
            <p className="text-gray-600">Rejoignez TaysirMed</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type de professionnel</label>
              <select
                value={typeClient}
                onChange={(e) => setTypeClient(e.target.value as "soignant" | "medecin")}
                className="w-full px-4 py-3 border rounded-lg"
              >
                <option value="soignant">Soignant paramédical</option>
                <option value="medecin">Médecin</option>
              </select>
            </div>

            {error && <div className="bg-red-100 text-red-700 px-3 py-2 rounded">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "Création..." : "Créer mon compte"}
            </button>
          </form>

          <p className="text-center text-sm mt-4">
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
