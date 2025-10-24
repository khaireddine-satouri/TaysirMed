// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Login from './components/Login';
import Signup from './components/Signup';

// ===== Soignant (V1 inchangé, chemins déplacés) =====
import SoignantLayout from './components/layouts/SoignantLayout';
import PatientsList from './components/soignant/PatientsList';
import PatientDetail from './components/soignant/PatientDetail';
import DossierDetail from './components/soignant/DossierDetail';
import EffectifDuJour from './components/soignant/EffectifDuJour';
import Dashboard, { type Filters as DashboardFilters } from './components/soignant/Dashboard';
import Settings from './components/soignant/Settings';
import AdminAnalytics from './components/soignant/AdminAnalytics';
import TicketsCollaborateur from './components/soignant/TicketsCollaborateur';
import TicketsAdmin from './components/soignant/TicketsAdmin';
import Planning from './components/soignant/Planning';

// ===== Médecin =====
import MedecinLayout from './components/layouts/MedecinLayout';
import RendezVousList from './components/medecin/RendezVousList';

import { supabase, type Patient, type DossierSoin } from './lib/supabase';

type View =
  | 'dashboard'
  | 'analyse'
  | 'patients'
  | 'effectif'
  | 'planning'
  | 'settings'
  | 'tickets_collab'
  | 'tickets_admin'
  | 'rdv';

type ClientType = 'soignant' | 'medecin';

function SpinnerFull() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
    </div>
  );
}

/** Écran fallback si l’utilisateur n’a pas encore de client associé. */
function NoClientFallback({ onFix }: { onFix: () => Promise<void> }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-xl shadow border p-6 space-y-4">
        <h2 className="text-xl font-semibold">Espace non initialisé</h2>
        <p className="text-gray-600">
          Votre compte est authentifié mais aucun espace client n&apos;est encore associé.
          Cliquez sur “Finaliser mon espace” pour terminer l’initialisation puis rechargez.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onFix}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Finaliser mon espace
          </button>
          <a
            href="/signup"
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
          >
            Refaire l’inscription
          </a>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, userBase, loading } = useAuth();

  // type_client du client courant
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState(false); // ⚠️ false par défaut

  const isAdmin = userBase?.type_utilisateur === 'admin';
  const isAssistant = userBase?.type_utilisateur === 'assistant';

  // navigation
  const [currentView, setCurrentView] = useState<View>('patients');

  // états V1 (soignant)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<DossierSoin | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] = useState<DashboardFilters | null>(null);

  const hasInitializedDefaultView = useRef(false);

  // routing minimaliste (sans react-router)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // Charger type_client à partir de clients(client_id)
  useEffect(() => {
    const loadClientType = async () => {
      // Rien à charger si pas de userBase ou pas de client_id
      if (!userBase?.client_id) {
        setClientType(null);
        setClientLoading(false);
        return;
      }

      try {
        setClientLoading(true);
        const { data, error } = await supabase
          .from('clients')
          .select('type_client')
          .eq('id', userBase.client_id)
          .maybeSingle();

        if (error) {
          console.error('Erreur chargement type_client:', error);
          setClientType(null); // on n’active pas un spinner infini
        } else {
          setClientType((data?.type_client ?? null) as ClientType | null);
        }
      } finally {
        setClientLoading(false);
      }
    };

    loadClientType();
  }, [userBase]);

  // Vue de départ dépendant du rôle et du type_client
  useEffect(() => {
    if (loading || clientLoading) return;
    if (!user || !userBase) return;

    // On ne bloque pas si clientType est null (cas: pas encore d’espace client)
    if (!hasInitializedDefaultView.current) {
      let startView: View = 'patients';

      if (clientType === 'soignant') {
        if (isAdmin) startView = 'analyse';
        else if (isAssistant) startView = 'effectif';
        else startView = 'patients';
      } else if (clientType === 'medecin') {
        startView = 'rdv';
      } else {
        // Pas de client : on laisse sur la vue par défaut (patients) mais on affichera le fallback
        startView = 'patients';
      }

      setCurrentView(startView);
      hasInitializedDefaultView.current = true;
    }
  }, [loading, clientLoading, user, userBase, clientType, isAdmin, isAssistant]);

  // ===== écrans non authentifiés =====
  if (loading) return <SpinnerFull />;

  if (!user || !userBase) {
    hasInitializedDefaultView.current = false;

    if (pathname === '/signup') {
      return <Signup />;
    }

    return (
      <Login
        onGoSignup={() => {
          if (typeof window !== 'undefined') window.location.href = '/signup';
        }}
      />
    );
  }

  // ===== si on charge le client, spinner court (vrai chargement) =====
  if (clientLoading) return <SpinnerFull />;

  // ===== Navigation commune =====
  const handleNavigate = (view: string) => {
    setCurrentView(view as View);
    setSelectedPatient(null);
    setSelectedDossier(null);
    if (view === 'dashboard') setDashOverrideFilters(null);
  };

  // ===== Actions V1 (soignant) =====
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedDossier(null);
  };
  const handleSelectDossier = (dossier: DossierSoin) => setSelectedDossier(dossier);
  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setSelectedDossier(null);
  };
  const handleBackToDossiers = () => setSelectedDossier(null);

  const openPatientById = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      if (error || !data) return;
      setSelectedPatient(data as Patient);
      setSelectedDossier(null);
      setCurrentView('patients');
    } catch (e) {
      console.error('Erreur chargement patient:', e);
    }
  };

  const openDossierById = async (dossierId: string) => {
    try {
      const { data: dossier, error: dErr } = await supabase
        .from('dossiers_soins')
        .select('*')
        .eq('id', dossierId)
        .single();
      if (dErr || !dossier) return;

      const { data: patient, error: pErr } = await supabase
        .from('patients')
        .select('*')
        .eq('id', (dossier as any).patient_id)
        .single();
      if (pErr || !patient) return;

      setSelectedPatient(patient as Patient);
      setSelectedDossier(dossier as DossierSoin);
      setCurrentView('patients');
    } catch (e) {
      console.error('Erreur chargement dossier/patient:', e);
    }
  };

  const openDashboardWithFilters = (filters: DashboardFilters) => {
    setDashOverrideFilters(filters);
    setCurrentView('dashboard');
  };

  // ===== Rendu Soignant (V1 inchangé) =====
  const renderSoignant = () => {
    const isAdminLocal = userBase?.type_utilisateur === 'admin';

    const renderContent = () => {
      if (selectedDossier && selectedPatient) {
        return (
          <DossierDetail
            dossier={selectedDossier}
            patient={selectedPatient}
            onBack={handleBackToDossiers}
          />
        );
      }

      if (selectedPatient) {
        return (
          <PatientDetail
            patient={selectedPatient}
            onBack={handleBackToPatients}
            onSelectDossier={handleSelectDossier}
          />
        );
      }

      switch (currentView) {
        case 'dashboard':
          return isAdminLocal ? (
            <Dashboard
              overrideInitialFilters={dashOverrideFilters}
              onSelectDossier={(dossier, patient) => {
                setSelectedPatient(patient);
                setSelectedDossier(dossier);
              }}
            />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        case 'analyse':
          return isAdminLocal ? (
            <AdminAnalytics onOpenDashboardWithFilters={openDashboardWithFilters} />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        case 'patients':
          return <PatientsList onSelectPatient={handleSelectPatient} />;

        case 'effectif':
          return (
            <EffectifDuJour
              onOpenDossier={(dossier, patient) => {
                setSelectedPatient(patient as Patient);
                setSelectedDossier(dossier as DossierSoin);
                setCurrentView('patients');
              }}
            />
          );

        case 'planning':
          return (
            <Planning
              onOpenDossier={(dossier, patient) => {
                setSelectedPatient(patient as Patient);
                setSelectedDossier(dossier as DossierSoin);
                setCurrentView('patients');
              }}
            />
          );

        case 'settings':
          return isAdminLocal ? <Settings /> : <PatientsList onSelectPatient={handleSelectPatient} />;

        case 'tickets_collab':
          return userBase?.type_utilisateur !== 'admin' ? (
            <TicketsCollaborateur onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        case 'tickets_admin':
          return isAdminLocal ? (
            <TicketsAdmin onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        default:
          return <PatientsList onSelectPatient={handleSelectPatient} />;
      }
    };

    return (
      <SoignantLayout currentView={currentView} onNavigate={handleNavigate}>
        {renderContent()}
      </SoignantLayout>
    );
  };

  // ===== Rendu Médecin =====
  const renderMedecin = () => {
    return (
      <MedecinLayout>
        {currentView === 'rdv' ? <RendezVousList /> : <RendezVousList />}
      </MedecinLayout>
    );
  };

  // ===== Cas “pas encore de client” → fallback au lieu de spinner infini =====
  if (!userBase.client_id) {
    const fix = async () => {
      // Essaie d’idempotence : s’assure qu’un client + users_base existent
      try {
        // Adapte si tu as renommé cette RPC
        await supabase.rpc('ensure_bootstrap_for_user', {
          p_user_id: user?.id,
          p_nom: user?.user_metadata?.nom ?? '',
          p_prenom: user?.user_metadata?.prenom ?? '',
          p_type_client: null
        });
        // puis reload
        window.location.reload();
      } catch (e) {
        console.error('ensure_bootstrap_for_user error', e);
        alert('Impossible de finaliser automatiquement. Passe par /signup ou réessaie.');
      }
    };
    return <NoClientFallback onFix={fix} />;
  }

  // ===== Switch layout selon type_client (si on l’a) =====
  if (clientType === 'soignant') return renderSoignant();
  if (clientType === 'medecin') return renderMedecin();

  // Si client_id existe mais pas de type_client lisible → afficher quelque chose d’exploitable
  return (
    <SoignantLayout currentView={currentView} onNavigate={handleNavigate}>
      <PatientsList onSelectPatient={(p) => setSelectedPatient(p)} />
    </SoignantLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
