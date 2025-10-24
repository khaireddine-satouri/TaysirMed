// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Auth
import Login from './components/Login';
import Signup from './components/Signup';

// ===== Soignant (V1 inchangé, chemins mis à jour) =====
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
  | 'rdv'; // vue par défaut pour le médecin

type ClientType = 'soignant' | 'medecin';

function SpinnerFull() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
  );
}

function AppContent() {
  const { user, userBase, loading, lastBusinessError } = useAuth();

  // type_client du client courant
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState<boolean>(false);

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

  // Charger type_client à partir de clients(client_id)
  useEffect(() => {
    // Si l’auth est encore en cours, on ne fait rien
    if (loading) return;

    // Si pas d’utilisateur connecté => pas de chargement client
    if (!user) {
      setClientType(null);
      setClientLoading(false);
      return;
    }

    // Si on a l'utilisateur mais pas encore son profil users_base, on attend
    if (!userBase) {
      setClientType(null);
      setClientLoading(false);
      return;
    }

    // Si l’utilisateur n’a pas (encore) de client_id, inutile de charger
    if (!userBase.client_id) {
      setClientType(null);
      setClientLoading(false);
      return;
    }

    const loadClientType = async () => {
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

    loadClientType();
  }, [loading, user, userBase]);

  // Vue de départ dépendant du rôle et du type_client
  useEffect(() => {
    if (loading || clientLoading) return;
    if (!user || !userBase) return; // non connecté => pas de vue
    if (!clientType) return; // pas de clientType => pas de vue (ou page médecin à terme)

    if (!hasInitializedDefaultView.current) {
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
  }, [loading, clientLoading, user, userBase, clientType, isAdmin, isAssistant]);

  // ===== écrans non authentifiés =====
  if (loading) return <SpinnerFull />;

  if (!user || !userBase) {
    // En cas de déconnexion, on autorise une réinitialisation à la prochaine connexion
    hasInitializedDefaultView.current = false;

    // route simple sans react-router
    if (pathname === '/signup') {
      return <Signup />;
    }
    return <Login onGoSignup={() => (window.location.href = '/signup')} />;
  }

  // Ici, on a user + userBase.
  // Si client en cours de chargement → spinner
  if (clientLoading) return <SpinnerFull />;

  // Si on a un "business error" (ex: client inactif), on force vers Login
  if (lastBusinessError === 'INACTIVE_CLIENT') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-sm max-w-md w-full text-center border">
          <p className="text-red-600 font-medium">
            Votre compte est désactivé. Veuillez contacter l’administrateur.
          </p>
          <a
            href="/"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            Retour
          </a>
        </div>
      </div>
    );
  }

  // Si pas de clientType (compte sans client rattaché – cas anormal si ton bootstrap est bien câblé)
  if (!clientType) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-sm max-w-md w-full text-center border">
          <p className="text-gray-700">
            Votre profil est chargé mais aucun espace client n’est encore rattaché.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Si vous venez de créer votre compte, patientez quelques secondes et rechargez la page.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
            >
              Recharger
            </button>
            <a
              href="/logout"
              onClick={(e) => {
                e.preventDefault();
                // pas de contexte ici → simple redirection
                // l’AuthContext écoutera onAuthStateChange
                supabase.auth.signOut().finally(() => window.location.replace('/'));
              }}
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
            >
              Se déconnecter
            </a>
          </div>
        </div>
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
        {/* Pour l’instant, on n’a que la page des RDV */}
        <RendezVousList />
      </MedecinLayout>
    );
  };

  // Switch layout selon type_client
  if (clientType === 'soignant') return renderSoignant();
  return renderMedecin();
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
