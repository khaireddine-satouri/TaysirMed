// src/components/soignant/Settings.tsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Settings as SettingsIcon, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type DashFilters = {
  etat: 'all' | 'a_venir' | 'en_cours' | 'termine';
  pec: 'all' | 'oui' | 'non';
  etatPec: 'all' | 'en_cours' | 'depose';
  paiement: 'all' | 'paye' | 'debiteur';
  activite: 'all' | 'actif' | 'inactif';
  dateDebut: string;
  dateFin: string;
  patientSearch: string;
  motifSearch: string;
};

const FALLBACK_DASH_FILTERS: DashFilters = {
  etat: 'en_cours',
  pec: 'all',
  etatPec: 'all',
  paiement: 'debiteur',
  activite: 'all',
  dateDebut: '',
  dateFin: '',
  patientSearch: '',
  motifSearch: '',
};

export default function Settings() {
  const { userBase } = useAuth();
  const clientId = userBase?.client_id;

  const [joursInactivite, setJoursInactivite] = useState('4');
  const [dashDefaultFilters, setDashDefaultFilters] = useState<DashFilters>(FALLBACK_DASH_FILTERS);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // --- Invitation collaborateurs ---
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'assistant' | 'secretaire'>('assistant');
  const [inviteMsg, setInviteMsg] = useState('');

  const isAdmin = userBase?.type_utilisateur === 'admin';

  useEffect(() => {
    if (clientId && isAdmin) {
      loadSettings();
    }
  }, [clientId, isAdmin]);

  const loadSettings = async () => {
    try {
      // jours_inactivite
      const { data: inact } = await supabase
        .from('app_settings')
        .select('valeur')
        .eq('client_id', clientId)
        .eq('cle', 'jours_inactivite')
        .maybeSingle();
      if (inact?.valeur) setJoursInactivite(inact.valeur);

      // dashboard_default_filters (JSON)
      const { data: dash } = await supabase
        .from('app_settings')
        .select('valeur')
        .eq('client_id', clientId)
        .eq('cle', 'dashboard_default_filters')
        .maybeSingle();
      if (dash?.valeur) {
        try {
          const parsed: DashFilters = JSON.parse(dash.valeur);
          setDashDefaultFilters({ ...FALLBACK_DASH_FILTERS, ...parsed });
        } catch {
          setDashDefaultFilters(FALLBACK_DASH_FILTERS);
        }
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  };

  const saveAll = async () => {
    if (!clientId) return;
    setLoading(true);
    setMessage('');

    try {
      await supabase.from('app_settings').upsert(
        { client_id: clientId, cle: 'jours_inactivite', valeur: joursInactivite },
        { onConflict: ['client_id', 'cle'] }
      );

      await supabase.from('app_settings').upsert(
        { client_id: clientId, cle: 'dashboard_default_filters', valeur: JSON.stringify(dashDefaultFilters) },
        { onConflict: ['client_id', 'cle'] }
      );

      setMessage('Paramètres enregistrés avec succès');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Erreur sauvegarde paramètres:', error);
      setMessage('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const inviteUser = async () => {
    if (!inviteEmail || !clientId) return;
    setInviteMsg('');
    try {
      // Créer un compte invité
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password: Math.random().toString(36).slice(-10), // mdp temporaire
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            type_utilisateur: inviteRole,
            type_client: userBase?.type_client,
            client_id: clientId,
          },
        },
      });

      if (error) throw error;

      setInviteMsg(`Une invitation de connexion a été envoyée à ${inviteEmail}.`);
      setInviteEmail('');
    } catch (err: any) {
      console.error('Erreur invitation:', err);
      setInviteMsg("Erreur lors de l'envoi de l'invitation.");
    }
  };

  const disabled = useMemo(() => !isAdmin, [isAdmin]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-6 h-6 text-teal-600" />
          <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
        </div>

        {!isAdmin && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 mb-6">
            Accès en lecture seule — seuls les administrateurs peuvent modifier ces paramètres.
          </div>
        )}

        {isAdmin && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-600" /> Inviter un collaborateur
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <input
                type="email"
                placeholder="Adresse email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'assistant' | 'secretaire')}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="assistant">Assistant</option>
                <option value="secretaire">Secrétaire</option>
              </select>
              <button
                type="button"
                onClick={inviteUser}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
              >
                Inviter
              </button>
            </div>

            {inviteMsg && (
              <p className="mt-3 text-sm text-gray-600">{inviteMsg}</p>
            )}
          </div>
        )}

        {/* --- Paramètres existants --- */}
        <div className="space-y-2 mb-8">
          <label className="block text-sm font-medium text-gray-700">
            Jours d'inactivité
          </label>
          <input
            type="number"
            min="1"
            value={joursInactivite}
            onChange={(e) => setJoursInactivite(e.target.value)}
            disabled={disabled}
            className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-50"
          />
        </div>

        {/* Filtres par défaut dashboard */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Filtres par défaut — Tableau de bord</h3>
          {/* ... tes selects / inputs existants ... */}
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-lg ${
              message.includes('succès')
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message}
          </div>
        )}

        <button
          onClick={saveAll}
          disabled={loading || disabled}
          className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
