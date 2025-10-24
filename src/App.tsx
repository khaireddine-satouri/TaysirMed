// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';

// ===== Soignant (V1 inchangé) =====
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

const LOAD_TIMEOUT_MS = 12_000;   // après 12s: déconnexion + redirection login
const WARNING_AFTER_MS = 6_000;   // après 6s: petit bandeau d’avertissement

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

/** Carte anti-blocage quand user connecté mais client_id pas encore prêt */
function BootstrapGate({
  onRetry,
  onLogout,
  message,
  loading,
}: {
  onRetry: () => void;
  onLogout: () => void;
  message?: string;
  loading?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-2">Préparation de votre espace…</h2>
        <p className="text-gray-600 mb-4">
          {message ||
            "Nous configurons votre espace (client & profil). Cela prend quelques secondes. Vous pouvez relancer la vérification si besoin."}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onRetry}
            disabled={!!loading}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? 'Vérification…' : 'Réessayer'}
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, userBase, loading, signOut } = useAuth();

  // Type du client (soignant | medecin)
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState(true);

  // Gate “busy” (quand client_id manque)
  const [gateBusy, setGateBusy] = useState(false);

  // Watchdog (avertissement + auto redirect)
  const [tookTooLong, setTookTooLong] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const warnRef = useRef<number | null>(null);

  const isAdmin = userBase?.type_utilisateur === 'admin';
  const isAssistant = userBase?.type_utilisateur === 'assistant';

  // navigation
  const [currentView, setCurrentView] = useState<View>('patients');

  // états V1 (soignant)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<DossierSoin | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] =
    useState<DashboardFilters | null>(null);

  const hasInitializedDefaultView = useRef(false);

  // routing minimaliste (sans react-router)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // ===== Watchdog: si “loading” (auth) OU “clientLoading” dure trop, on force retour login
  useEffect(() => {
    const skip = pathname === '/signup';

    const clearTimers = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (warnRef.current) {
        window.clearTimeout(warnRef.current);
        warnRef.current = null;
      }
      setTookTooLong(false);
    };

    if (!skip && (loading || clientLoading)) {
      warnRef.current = window.setTimeout(
        () => setTookTooLong(true),
        WARNING_AFTER_MS
      ) as unknown as number;

      timeoutRef.current = window.setTimeout(async () => {
        try {
          await signOut();
        } catch {
          // noop
        } finally {
          if (typeof window !== 'undefined') {
            window.location.replace('/login');
          }
        }
      }, LOAD_TIMEOUT_MS) as unknown as number;
    } else {
      clearTimers();
    }

    return clearTimers;
  }, [loading, clientLoading, pathname, signOut]);

  // Charger type_client depuis la table clients
  useEffect(() => {
    const loadClientType = async () => {
      if (!userBase?.client_id) {
        setClientType(null);
        setClientLoading(false);
        return;
      }
      setClientLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('type_client')
        .eq('id', userBase.client_id)
        .maybeSingle();

      if (error) {
        console.error('Erreur chargement type_client:', error);
        setClientType(null);
      } else {
        setClientType((data?.type_client ?? null) as ClientType | null);
      }
      setClientLoading(false);
    };

    if (userBase) loadClientType();
  }, [userBase]);

  // Vue de départ (en fonction rôle & type_client)
  useEffect(() => {
    if (loading || clientLoading) return;
    if (!user || !userBase || !clientType) return;

    if (!hasInitializedDefaultView.current) {
      let startView: View = 'patients';
      if (clientType === 'soignant') {
        if (isAdmin) startView = 'analyse';
        else if (isAssistant) startView = 'effectif';
        else startView = 'patients';
      } else {
        startView = 'rdv';
      }
      setCurrentView(startView);
      hasInitializedDefaultView.current = true;
    }
  }, [loading, clientLoading, user, userBase, clientType, isAdmin, isAssistant]);

  // ===== écrans non authentifiés =====
  if (loading) {
    return (
      <div className="relative">
        <SpinnerFull />
        {tookTooLong && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg shadow">
            La connexion prend plus de temps que prévu…{' '}
            <button
              onClick={() => (typeof window !== 'undefined' ? window.location.replace('/login') : null)}
              className="underline ml-1"
            >
              revenir au login
            </button>
          </div>
        )}
      </div>
    );
  }

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

  // ===== User connecté mais pas de client_id -> Gate (pas de hooks conditionnels : state défini plus haut)
  if (!userBase.client_id) {
    const retry = async () => {
      if (gateBusy) return;
      setGateBusy(true);
      try {
        // Stratégie simple: on re-tente un refresh “doux” (au besoin, appeler une RPC idempotente)
        const { data: ub } = await supabase
          .from('users_base')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (ub?.client_id && typeof window !== 'undefined') {
          window.location.reload();
        } else {
          // fallback: simple reload
          if (typeof window !== 'undefined') window.location.reload();
        }
      } catch (e) {
        console.error('Retry bootstrap error:', e);
      } finally {
        setGateBusy(false);
      }
    };

    const logout = () =>
      signOut().finally(() => {
        if (typeof window !== 'undefined') window.location.replace('/login');
      });

    return <BootstrapGate loading={gateBusy} onRetry={retry} onLogout={logout} />;
  }

  // ===== Client connu mais type non encore chargé : petit spinner + avertissement possible
  if (clientLoading) {
    return (
      <div className="relative">
        <SpinnerFull />
        {tookTooLong && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg shadow">
            Initialisation de l’espace en cours…
            <button
              onClick={async () => {
                try {
                  await signOut();
                } finally {
                  if (typeof window !== 'undefined') window.location.replace('/login');
                }
              }}
              className="underline ml-1"
            >
              revenir au login
            </button>
          </div>
        )}
      </div>
    );
  }

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

  // ===== Rendu Médecin =====
  const renderMedecin = () => {
    return (
      <MedecinLayout>
        {currentView === 'rdv' ? <RendezVousList /> : <RendezVousList />}
      </MedecinLayout>
    );
  };

  // Switch layout selon type_client
  if (clientType === 'soignant') return renderSoignant();
  if (clientType === 'medecin') return renderMedecin();

  // Sécurité: cas edge
  return <SpinnerFull />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
