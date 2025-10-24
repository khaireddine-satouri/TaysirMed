import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Stethoscope, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      if (err?.message === "INACTIVE_CLIENT" || err?.code === "INACTIVE_CLIENT") {
        setError("Votre compte est desactive. Veuillez contacter l'administrateur de la plateforme.");
      } else {
        setError("Email ou mot de passe incorrect");
      }
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">TaysirMed</h1>
            <p className="text-gray-600">Connexion a votre espace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="vous@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          {/* Signup link */}
          <div className="text-center text-sm">
            <span className="text-gray-600">Nouveau ? </span>
            <Link to="/signup" className="text-teal-700 hover:underline">
              Creer un compte
            </Link>
          </div>

          {/* Contact info */}
          <div className="space-y-4">
            <p className="text-center text-xs text-gray-400">
              Ce site est a usage personnel. Pour toute demande d’information, contactez-nous :
            </p>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-teal-600" />
              <a href="mailto:contact@taysirmed.tn" className="hover:underline">
                contact@taysirmed.tn
              </a>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-teal-600" />
              <a href="tel:+21622233366" className="hover:underline">
                +216 22 233 366
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
