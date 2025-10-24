// src/components/Signup.tsx
import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { supabase, ClientType } from '../lib/supabase';

export default function Signup() {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [typeClient, setTypeClient] = useState<ClientType>('soignant');

  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setOkMsg('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pwd,
        options: {
          data: {
            nom,
            prenom,
            type_client: typeClient, // ⬅️ le trigger lira ça
          },
          // NOTE: si email confirmation activée dans Supabase Auth,
          // il n'y aura pas de session à la création.
        },
      });

      if (error) throw error;

      // Le trigger va créer clients + users_base(admin) automatiquement.
      // Si la confirmation email est activée, on prévient l'utilisateur.
      const needsEmailConfirmation = !data.session;
      if (needsEmailConfirmation) {
        setOkMsg(
          "Compte créé. Veuillez confirmer votre adresse e-mail, puis connectez-vous."
        );
      } else {
        setOkMsg("Compte créé avec succès. Redirection…");
        setTimeout(() => window.location.replace('/'), 800);
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message ?? 'Erreur lors de la création du compte');
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
                  onChange={e => setPrenom(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input
                  value={nom}
                  onChange={e => setNom(e.target.value)}
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
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  placeholder="vous@domaine.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  required
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  placeholder="••••••••"
                />
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
                      Gestion en temps réel des dossiers de soins, du suivi des séances et du personnel associé.
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
                      Gestion des dossiers médicaux, des rendez-vous et du personnel associé.
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
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
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
