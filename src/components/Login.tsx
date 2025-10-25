import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  Stethoscope,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";

/**
 * Login (optimisé UI/UX + accessibilité)
 * - Icônes dans les champs, focus visibles
 * - Affichage/masquage du mot de passe
 * - Détection Caps Lock
 * - Gestion d'erreurs accessible via aria-live
 * - Bouton avec état de chargement + prévention double submit
 * - Champs avec autoComplete pour un remplissage natif
 * - Lien "Mot de passe oublié" optionnel
 * - Petit message RGPD en bas
 */
export default function Login({
  onSwitchToSignup,
  onForgotPassword,
}: {
  onSwitchToSignup: () => void;
  onForgotPassword?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  // Empêche le submit si champs vides
  const canSubmit = useMemo(() => email.trim() !== "" && password.trim() !== "", [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError("");
    setLoading(true);

    try {
      // Optionnel : persistance via localStorage si rememberMe
      if (rememberMe) {
        try {
          localStorage.setItem("tm_last_email", email);
        } catch {}
      } else {
        try {
          localStorage.removeItem("tm_last_email");
        } catch {}
      }

      await signIn(email, password);
    } catch (err: any) {
      if (err?.message === "INACTIVE_CLIENT") {
        setError(
          "Votre compte est désactivé. Veuillez contacter l'administrateur de la plateforme."
        );
      } else {
        setError("Email ou mot de passe incorrect");
      }
    } finally {
      setLoading(false);
    }
  };

  // Récup email mémorisé
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tm_last_email");
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center select-none">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
              <Stethoscope className="w-8 h-8 text-teal-600" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">TaysirMed</h1>
            <p className="text-gray-600 mt-1">Connexion à votre espace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email <span className="text-gray-400" aria-hidden>＊</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition placeholder:text-gray-400"
                  placeholder="votre@email.com"
                  aria-invalid={!!error}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Mot de passe <span className="text-gray-400" aria-hidden>＊</span>
                </label>
                {typeof onForgotPassword === "function" ? (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm text-teal-700 hover:underline focus:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                ) : null}
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn((e as any).getModifierState?.("CapsLock") || false)}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition placeholder:text-gray-400"
                  placeholder="••••••••"
                  aria-invalid={!!error}
                  aria-describedby={capsOn ? "caps-hint" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPw ? <EyeOff className="w-5 h-5 text-gray-500" /> : <Eye className="w-5 h-5 text-gray-500" />}
                </button>
              </div>
              {capsOn && (
                <p id="caps-hint" className="mt-1 text-xs text-amber-600">
                  Attention : Verr. Maj est activé.
                </p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  className="accent-teal-600 rounded"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Se souvenir de moi
              </label>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <ShieldCheck className="w-4 h-4" />
                Sécurisé & chiffré
              </span>
            </div>

            {/* Errors */}
            <div role="status" aria-live="polite">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          {/* Lien Signup */}
          <p className="text-center text-sm mt-2">
            Pas encore de compte ?{" "}
            <button onClick={onSwitchToSignup} className="text-teal-700 hover:underline font-medium">
              Créer un compte
            </button>
          </p>

          {/* Contact info */}
          <div className="pt-2 space-y-3">
            <p className="text-center text-xs text-gray-400">Besoin d'aide ? Contactez‑nous :</p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-teal-600" aria-hidden="true" />
              <a href="mailto:contact@taysirmed.tn" className="hover:underline">contact@taysirmed.tn</a>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-teal-600" aria-hidden="true" />
              <a href="tel:+21622233366" className="hover:underline">+216 22 233 366</a>
            </div>
          </div>

          {/* Legal */}
          <p className="text-center text-[11px] leading-relaxed text-gray-400">
            En vous connectant, vous acceptez nos conditions d’utilisation et notre politique de confidentialité.
          </p>
        </div>
      </div>
    </div>
  );
}
