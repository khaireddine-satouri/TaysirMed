// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';

// ===== Soignant (V1 inchangé) =====
import SoignantLayout from './components/layouts/SoignantLayout';
import PatientsList from './components/PatientsList';
import PatientDetail from './components/PatientDetail';
import DossierDetail from './components/DossierDetail';
import EffectifDuJour from './components/EffectifDuJour';
import Dashboard, { Filters as DashboardFilters } from './components/Dashboard';
import Settings from './components/Settings';
import AdminAnalytics from './components/AdminAnalytics';
import TicketsCollaborateur from './components/TicketsCollaborateur';
import TicketsAdmin from './components/TicketsAdmin';
import Planning from './components/Planning';

// ===== Médecin =====
import MedecinLayout from './components/layouts/MedecinLayout';

import { supabase } from './lib/supabase';

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

/** Placeholder RDV (médecin) — écran vide pour l’instant */
function MedecinRendezVousEmpty() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-lg font-semibold mb-2">Prochains rendez-vous</h2>
      <p className="text-gray-600">Aucun rendez-vous pour le moment.</p>
    </div>
  );
}

function AppContent() {
  const { user, userBase, loading } = useAuth();

  // type_client du client courant
  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState(true);

  const isAdmin = userBase?.type_utilisateur === 'admin';
  const isAssistant = userBase?.type_utilisateur === 'assistant';

  // navigation
  const [currentView, setCurrentView] = useState<View>('patients');

  // états V1 (soignant)
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<any | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] =
    useState<DashboardFilters | null>(null);

  const hasInitializedDefaultView = useRef(false);

  // routing minimaliste (sans react-router)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // Charger type_client à partir de clients(client_id)
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

  // Vue de départ dépendant du rôle et du type_client
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
    hasInitializedDefaultView.current = false;
    if (pathname === '/signup') return <Signup />;
    return <Login />;
  }

  if (clientLoading || !clientType) return <SpinnerFull />;

  // ===== Navigation commune =====
  const handleNavigate = (view: string) => {
    setCurrentView(view as View);
    setSelectedPatient(null);
    setSelectedDossier(null);
    if (view === 'dashboard') setDashOverrideFilters(null);
  };

  // ===== Actions V1 (soignant) =====
  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient);
    setSelectedDossier(null);
  };
  const handleSelectDossier = (dossier: any) => setSelectedDossier(dossier);
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
      setSelectedPatient(data);
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
        .eq('id', dossier.patient_id)
        .single();
      if (pErr || !patient) return;

      setSelectedPatient(patient);
      setSelectedDossier(dossier);
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
                setSelectedPatient(patient);
                setSelectedDossier(dossier);
                setCurrentView('patients');
              }}
            />
          );

        case 'planning':
          return (
            <Planning
              onOpenDossier={(dossier, patient) => {
                setSelectedPatient(patient);
                setSelectedDossier(dossier);
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
    // Pour l’instant, uniquement la vue RDV vide
    return (
      <MedecinLayout>
        {currentView === 'rdv' ? <MedecinRendezVousEmpty /> : <MedecinRendezVousEmpty />}
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
