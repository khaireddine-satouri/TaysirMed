// src/components/Signup.tsx
import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ClientType = 'soignant' | 'medecin';

export default function Signup() {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [typeClient, setTypeClient] = useState<ClientType>('soignant');

  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const canSubmit =
    !loading &&
    email.trim().length > 3 &&
    pwd.trim().length >= 8 &&
    (nom.trim().length > 0 || prenom.trim().length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setOkMsg('');
    if (!canSubmit) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pwd,
        options: {
          data: {
            nom,
            prenom,
            type_client: typeClient, // ⬅️ le trigger s’en sert
          },
          // emailRedirectTo: `${window.location.origin}/` // si tu veux un redirect après validation email
        },
      });
      if (error) throw error;

      if (!data.user) {
        // mode "email confirmation" → pas de session tout de suite
        setOkMsg(
          "Compte créé. Veuillez confirmer votre adresse e-mail, puis connectez-vous."
        );
      } else {
        // si "email auto-confirm" est activé, l'utilisateur est authentifié
        setOkMsg('Compte créé avec succès. Redirection…');
        setTimeout(() => window.location.replace('/'), 600);
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg(
        err?.message ??
          "Une erreur est survenue lors de la création de l'espace"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
              <Stethoscope className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Créer un compte</h1>
            <p className="text-gray-600">
              Un nouvel espace sera créé pour votre cabinet.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Prénom</label>
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  placeholder="vous@domaine.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mot de passe <span className="text-xs text-gray-500">(min. 8)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500 pr-20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute inset-y-0 right-0 px-3 text-sm text-gray-600 hover:text-gray-900"
                    aria-label={showPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showPwd ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium">Type de professionnel</legend>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="type_client"
                    checked={typeClient === 'soignant'}
                    onChange={() => setTypeClient('soignant')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Soignant paramédical</span>
                    <span className="block text-sm text-gray-600">
                      Gestion des dossiers de soins, suivi des séances, personnel associé.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="type_client"
                    checked={typeClient === 'medecin'}
                    onChange={() => setTypeClient('medecin')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Médecin</span>
                    <span className="block text-sm text-gray-600">
                      Dossiers médicaux, rendez-vous et personnel associé.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {errMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {errMsg}
              </div>
            )}
            {okMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
                {okMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Création…' : 'Créer mon espace'}
            </button>

            <div className="text-center text-sm">
              <a href="/login" className="text-teal-700 hover:underline">Déjà un compte ? Se connecter</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
