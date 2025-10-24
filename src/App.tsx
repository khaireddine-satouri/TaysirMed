import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase, type Patient, type DossierSoin } from './lib/supabase';

import Login from './components/Login';
import Signup from './components/Signup';

// Soignant
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

// Médecin
import MedecinLayout from './components/layouts/MedecinLayout';
import RendezVousList from './components/medecin/RendezVousList';

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

function AppContent() {
  const { user, userBase, loading, initializingProfile } = useAuth();

  const [clientType, setClientType] = useState<ClientType | null>(null);
  const [clientLoading, setClientLoading] = useState(false);

  const isAdmin = userBase?.type_utilisateur === 'admin';
  const isAssistant = userBase?.type_utilisateur === 'assistant';

  const [currentView, setCurrentView] = useState<View>('patients');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<DossierSoin | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] = useState<DashboardFilters | null>(null);

  const hasInitializedDefaultView = useRef(false);
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // 1) États de chargement init
  if (loading) return <SpinnerFull />; // auth init (court)
  if (!user || !userBase) {
    // pas de session → auth pages
    if (pathname === '/signup') return <Signup />;
    return <Login onGoSignup={() => (window.location.href = '/signup')} />;
  }
  if (initializingProfile) return <SpinnerFull />; // lecture users_base (court)

  // 2) Charger le type_client quand on a un client_id
  useEffect(() => {
    const run = async () => {
      if (!userBase?.client_id) {
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
        if (error) {
          console.error('Erreur type_client:', error);
          setClientType(null);
        } else {
          setClientType((data?.type_client ?? null) as ClientType | null);
        }
      } finally {
        setClientLoading(false);
      }
    };
    run();
  }, [userBase?.client_id]);

  if (clientLoading) return <SpinnerFull />;

  // 3) Vue de départ
  useEffect(() => {
    if (!user || !userBase) return;
    if (hasInitializedDefaultView.current) return;

    let start: View = 'patients';
    if (clientType === 'soignant') {
      start = isAdmin ? 'analyse' : isAssistant ? 'effectif' : 'patients';
    } else if (clientType === 'medecin') {
      start = 'rdv';
    }
    setCurrentView(start);
    hasInitializedDefaultView.current = true;
  }, [user, userBase, clientType, isAdmin, isAssistant]);

  // 4) Navigation commune
  const handleNavigate = (view: string) => {
    setCurrentView(view as View);
    setSelectedPatient(null);
    setSelectedDossier(null);
    if (view === 'dashboard') setDashOverrideFilters(null);
  };

  // Helpers V1 soignant
  const handleSelectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setSelectedDossier(null);
  };
  const handleSelectDossier = (d: DossierSoin) => setSelectedDossier(d);
  const handleBackToPatients = () => { setSelectedPatient(null); setSelectedDossier(null); };
  const handleBackToDossiers = () => setSelectedDossier(null);

  const openPatientById = async (patientId: string) => {
    const { data } = await supabase.from('patients').select('*').eq('id', patientId).single();
    if (!data) return;
    setSelectedPatient(data as Patient);
    setSelectedDossier(null);
    setCurrentView('patients');
  };
  const openDossierById = async (dossierId: string) => {
    const { data: dossier } = await supabase.from('dossiers_soins').select('*').eq('id', dossierId).single();
    if (!dossier) return;
    const { data: patient } = await supabase.from('patients').select('*').eq('id', (dossier as any).patient_id).single();
    if (!patient) return;
    setSelectedPatient(patient as Patient);
    setSelectedDossier(dossier as DossierSoin);
    setCurrentView('patients');
  };
  const openDashboardWithFilters = (f: DashboardFilters) => { setDashOverrideFilters(f); setCurrentView('dashboard'); };

  // 5) Rendu Soignant
  const renderSoignant = () => {
    const isAdminLocal = isAdmin;

    const content = () => {
      if (selectedDossier && selectedPatient) {
        return <DossierDetail dossier={selectedDossier} patient={selectedPatient} onBack={handleBackToDossiers} />;
      }
      if (selectedPatient) {
        return <PatientDetail patient={selectedPatient} onBack={handleBackToPatients} onSelectDossier={handleSelectDossier} />;
      }
      switch (currentView) {
        case 'dashboard':
          return isAdminLocal ? (
            <Dashboard
              overrideInitialFilters={dashOverrideFilters}
              onSelectDossier={(d, p) => { setSelectedPatient(p); setSelectedDossier(d); }}
            />
          ) : <PatientsList onSelectPatient={handleSelectPatient} />;
        case 'analyse':
          return isAdminLocal ? (
            <AdminAnalytics onOpenDashboardWithFilters={openDashboardWithFilters} />
          ) : <PatientsList onSelectPatient={handleSelectPatient} />;
        case 'patients':
          return <PatientsList onSelectPatient={handleSelectPatient} />;
        case 'effectif':
          return <EffectifDuJour onOpenDossier={(d, p) => { setSelectedPatient(p as Patient); setSelectedDossier(d as DossierSoin); setCurrentView('patients'); }} />;
        case 'planning':
          return <Planning onOpenDossier={(d, p) => { setSelectedPatient(p as Patient); setSelectedDossier(d as DossierSoin); setCurrentView('patients'); }} />;
        case 'settings':
          return isAdminLocal ? <Settings /> : <PatientsList onSelectPatient={handleSelectPatient} />;
        case 'tickets_collab':
          return !isAdminLocal ? (
            <TicketsCollaborateur onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
          ) : <PatientsList onSelectPatient={handleSelectPatient} />;
        case 'tickets_admin':
          return isAdminLocal ? (
            <TicketsAdmin onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
          ) : <PatientsList onSelectPatient={handleSelectPatient} />;
        default:
          return <PatientsList onSelectPatient={handleSelectPatient} />;
      }
    };

    return (
      <SoignantLayout currentView={currentView} onNavigate={handleNavigate}>
        {content()}
      </SoignantLayout>
    );
  };

  // 6) Rendu Médecin
  const renderMedecin = () => (
    <MedecinLayout>
      {currentView === 'rdv' ? <RendezVousList /> : <RendezVousList />}
    </MedecinLayout>
  );

  // 7) Si pas de client_id (après auth propre) → proposer signup
  if (!userBase.client_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg w-full rounded-xl shadow border p-6 space-y-4">
          <h2 className="text-xl font-semibold">Espace non configuré</h2>
          <p className="text-gray-600">Votre compte est connecté, mais aucun espace client n’est lié. Créez-le maintenant.</p>
          <div className="flex gap-3">
            <a className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700" href="/signup">Créer mon espace</a>
            <button
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              onClick={() => supabase.auth.signOut()}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 8) Route finale selon type_client
  if (clientType === 'soignant') return renderSoignant();
  if (clientType === 'medecin') return renderMedecin();

  // fallback : si type_client non lu, on montre quand même le layout soignant
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
