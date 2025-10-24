import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages Auth
import Login from "./components/Login";
import Signup from "./components/Signup";

// Layouts
import SoignantLayout from "./components/layouts/SoignantLayout";
import MedecinLayout from "./components/layouts/MedecinLayout";

// Soignant
import Dashboard from "./components/soignant/Dashboard";
import PatientsList from "./components/soignant/PatientsList";
import Planning from "./components/soignant/Planning";
import Settings from "./components/soignant/Settings";

// Médecin
import RendezVousList from "./components/medecin/RendezVousList";

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);
  const [currentView, setCurrentView] = useState<string>("patients");
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (loading || !profile) return;
    if (!hasInitialized.current) {
      // Vue par défaut selon type_client
      if (profile.type_client === "soignant") {
        setCurrentView("patients");
      } else if (profile.type_client === "medecin") {
        setCurrentView("rendezvous");
      }
      hasInitialized.current = true;
    }
  }, [loading, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return showSignup ? (
      <Signup onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  // ----- connecté -----
  if (profile.type_client === "soignant") {
    return (
      <SoignantLayout currentView={currentView} onNavigate={setCurrentView}>
        {currentView === "dashboard" && <Dashboard />}
        {currentView === "patients" && <PatientsList />}
        {currentView === "planning" && <Planning />}
        {currentView === "settings" && profile.type_utilisateur === "admin" && <Settings />}
      </SoignantLayout>
    );
  }

  if (profile.type_client === "medecin") {
    return (
      <MedecinLayout currentView={currentView} onNavigate={setCurrentView}>
        {currentView === "rendezvous" && <RendezVousList />}
        {/* plus tard: dossiers_medecin, patients etc. */}
      </MedecinLayout>
    );
  }

  return <div>Type de client inconnu</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
