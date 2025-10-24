import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../src/lib/supabase";
import { Stethoscope } from "lucide-react";

export default function Signup() {
  const nav = useNavigate();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [typeClient, setTypeClient] = useState<"soignant" | "medecin">("soignant");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      // 1) Creation du compte Auth avec metadonnees
      const { data: sign, error: signErr } = await supabase.auth.signUp({
        email,
        password: pwd,
        options: {
          data: {
            nom,
            prenom,
            type_utilisateur: "admin", // tres important pour users_base
            type_client: typeClient,   // soignant | medecin
          },
        },
      });
      if (signErr) throw signErr;

      // Si la confirmation email est active, l'utilisateur n'est pas connecte immédiatement
      // On affiche un message et on stoppe proprement.
      if (!sign.session) {
        alert("Compte cree. Verifiez votre email pour confirmer votre inscription.");
        return nav("/login");
      }

      // 2) Provisionning: creer le client + attacher users_base.client_id
      const cabinetName = `Cabinet ${nom} ${prenom}`.trim().replace(/\s+/g, " ");
      const { error: rpcErr } = await supabase.rpc("bootstrap_create_client_for_current_user", {
        p_client_name: cabinetName,
      });
      if (rpcErr) {
        // Fallback message explicite (souvent RPC manquant)
        console.error(rpcErr);
        throw new Error(
          "Initialisation du compte impossible (RPC manquant). Merci de contacter le support."
        );
      }

      // 3) Redirection selon type_client
      if (typeClient === "soignant") nav("/soignant", { replace: true });
      else nav("/medecin/consultations", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lors de la creation du compte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
              <Stethoscope className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Creation de compte</h1>
            <p className="text-gray-600">Creez votre espace professionnel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prenom</label>
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type de professionnel</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className={`border rounded-lg p-3 cursor-pointer ${typeClient === "soignant" ? "ring-2 ring-teal-500" : ""}`}>
                  <input
                    type="radio"
                    name="type_client"
                    className="sr-only"
                    checked={typeClient === "soignant"}
                    onChange={() => setTypeClient("soignant")}
                  />
                  <div className="font-medium">Soignant paramedical</div>
                  <div className="text-xs text-gray-500">
                    Dossiers de soins, suivi des seances et personnel associe
                  </div>
                </label>
                <label className={`border rounded-lg p-3 cursor-pointer ${typeClient === "medecin" ? "ring-2 ring-teal-500" : ""}`}>
                  <input
                    type="radio"
                    name="type_client"
                    className="sr-only"
                    checked={typeClient === "medecin"}
                    onChange={() => setTypeClient("medecin")}
                  />
                  <div className="font-medium">Medecin</div>
                  <div className="text-xs text-gray-500">
                    Dossiers medicaux, rendez-vous et personnel associe
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="vous@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{err}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creation..." : "Creer mon compte"}
            </button>
          </form>

          <div className="text-center text-sm">
            <span className="text-gray-600">Deja inscrit ? </span>
            <Link to="/login" className="text-teal-700 hover:underline">
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
