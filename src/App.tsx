// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';

// ===== Soignant (V1) =====
import SoignantLayout from './components/layouts/SoignantLayout';
import PatientsList from './components/soignant/PatientsList';
import PatientDetail from './components/soignant/PatientDetail';
import DossierDetail from './components/soignant/DossierDetail';
import EffectifDuJour from './components/soignant/EffectifDuJour';
import Dashboard, { Filters as DashboardFilters } from './components/soignant/Dashboard';
import Settings from './components/soignant/Settings';
import AdminAnalytics from './components/soignant/AdminAnalytics';
import TicketsCollaborateur from './components/soignant/TicketsCollaborateur';
import TicketsAdmin from './components/soignant/TicketsAdmin';
import Planning from './components/soignant/Planning';

// ===== Médecin =====
import MedecinLayout from './components/layouts/MedecinLayout';
import RendezVousList from './components/medecin/RendezVousList';

import { supabase, Patient, DossierSoin } from './lib/supabase';

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
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
  );
}

function PendingTenantScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full space-y-4 border">
        <h1 className="text-2xl font-bold text-gray-900">Espace en cours de création</h1>
        <p className="text-gray-600">
          Votre compte est connecté, mais l’espace client n’est pas encore prêt. Cliquez sur
          <span className="font-medium"> “Réessayer”</span> pour terminer l’initialisation.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            Réessayer
          </button>
          <a href="/signup" className="px-4 py-2 rounded-lg border hover:bg-gray-50">
            Retour à l’inscription
          </a>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, userBase, loading } = useAuth();

  // type_client (soignant/medecin)
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState<boolean>(true);

  // Vue courante
  const [currentView, setCurrentView] = useState<View>('patients');

  // Etats V1 (soignant)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<DossierSoin | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] = useState<DashboardFilters | null>(null);

  const hasInitializedDefaultView = useRef(false);
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // Charger le type_client seulement si on a un client_id
  useEffect(() => {
    const loadClientType = async () => {
      // pas d'utilisateur ou pas de profil -> on laisse AuthContext gérer
      if (!user || !userBase) {
        setClientLoading(false);
        return;
      }

      // si pas de client_id, on ne boucle pas au spinner : on indique état "pending"
      if (!userBase.client_id) {
        setClientType(null);
        setClientLoading(false);
        return;
      }

      setClientLoading(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('type_client')
          .eq('id', userBase.client_id)
          .maybeSingle();

        if (error) throw error;
        setClientType((data?.type_client ?? null) as ClientType | null);
      } catch (e) {
        console.error('Erreur chargement type_client:', e);
        setClientType(null);
      } finally {
        setClientLoading(false);
      }
    };

    loadClientType();
  }, [user, userBase]);

  // Déterminer la vue par défaut quand on a toutes les infos
  useEffect(() => {
    if (loading) return;

    // pas de user → pas de vue à initialiser
    if (!user || !userBase) return;

    // si pas de client_id, on ne choisit pas de vue: on affichera l’écran "pending"
    if (!userBase.client_id) return;

    // il faut aussi que clientType soit connu
    if (!clientType) return;

    if (!hasInitializedDefaultView.current) {
      const isAdmin = userBase.type_utilisateur === 'admin';
      const isAssistant = userBase.type_utilisateur === 'assistant';

      let startView: View = 'patients';
      if (clientType === 'soignant') {
        if (isAdmin) startView = 'analyse';
        else if (isAssistant) startView = 'effectif';
        else startView = 'patients';
      } else {
        // Médecin
        startView = 'rdv';
      }

      setCurrentView(startView);
      hasInitializedDefaultView.current = true;
    }
  }, [loading, user, userBase, clientType]);

  // ===== Etats non authentifiés =====
  if (loading) return <SpinnerFull />;

  if (!user || !userBase) {
    hasInitializedDefaultView.current = false;

    if (pathname === '/signup') {
      return <Signup />;
    }

    return (
      <Login
        onGoSignup={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/signup';
          }
        }}
      />
    );
  }

  // ===== utilisateur connecté mais SANS client_id -> écran "pending" + bouton "Réessayer" =====
  if (!userBase.client_id) {
    const retry = async () => {
      try {
        // tente une RPC idempotente côté DB pour créer client + users_base si besoin
        await supabase
          .rpc('ensure_bootstrap_for_user', {
            p_user_id: user.id,
            p_nom: user.user_metadata?.nom ?? '',
            p_prenom: user.user_metadata?.prenom ?? '',
            p_type_client: null, // si null ici, la RPC doit ignorer la màj type_client
          })
          .catch(() => { /* ignore */ });

        // recharge le profil
        const { data, error } = await supabase
          .from('users_base')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          // force un refresh complet de l’app
          if (typeof window !== 'undefined') window.location.reload();
        }
      } catch (e) {
        // noop: l’écran reste et l’utilisateur peut réessayer
        console.error('Retry bootstrap error:', e);
      }
    };

    return <PendingTenantScreen onRetry={retry} />;
  }

  // ===== si on a un client_id mais le type_client n’est pas encore chargé, on peut spinner brièvement =====
  if (clientLoading || !clientType) return <SpinnerFull />;

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

  // ===== Rendu Soignant (layout + navigation V1) =====
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
          return isAdminLocal ? (
            <Settings />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        case 'tickets_collab':
          return userBase?.type_utilisateur !== 'admin' ? (
            <TicketsCollaborateur
              onOpenPatient={openPatientById}
              onOpenDossier={openDossierById}
            />
          ) : (
            <PatientsList onSelectPatient={handleSelectPatient} />
          );

        case 'tickets_admin':
          return isAdminLocal ? (
            <TicketsAdmin
              onOpenPatient={openPatientById}
              onOpenDossier={openDossierById}
            />
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

  // ===== Rendu Médecin (simple pour le moment) =====
  const renderMedecin = () => {
    return (
      <MedecinLayout>
        {currentView === 'rdv' ? <RendezVousList /> : <RendezVousList />}
      </MedecinLayout>
    );
  };

  return clientType === 'soignant' ? renderSoignant() : renderMedecin();
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
