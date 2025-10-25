// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type UserBase } from "../lib/supabase";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  userBase: UserBase | null;
  loading: boolean;
  isAdmin: boolean;
  isSoignant: boolean;
  isMedecin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userBase: null,
  loading: true,
  isAdmin: false,
  isSoignant: false,
  isMedecin: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [userBase, setUserBase] = useState<UserBase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      if (data.session?.user) {
        await loadUserBase(data.session.user.id);
      }
      setLoading(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess?.user) {
        setUserBase(null);
      } else {
        loadUserBase(sess.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadUserBase = async (uid: string) => {
    const { data } = await supabase
      .from("users_base")
      .select("id, nom, prenom, type_utilisateur, type_client, client_id, created_at, updated_at")
      .eq("id", uid)
      .maybeSingle();

    setUserBase((data as UserBase) ?? null);
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Vérifier si le client est actif
    if (data.user) {
      const { data: ub } = await supabase
        .from("users_base")
        .select("client_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (ub?.client_id) {
        const { data: client } = await supabase
          .from("clients")
          .select("statut")
          .eq("id", ub.client_id)
          .maybeSingle();

        if (client?.statut === "inactif") {
          await supabase.auth.signOut();
          const err = new Error("INACTIVE_CLIENT");
          (err as any).code = "INACTIVE_CLIENT";
          throw err;
        }
      }
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextType = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      userBase,
      loading,
      isAdmin: userBase?.type_utilisateur === "admin",
      isSoignant: userBase?.type_client === "soignant",
      isMedecin: userBase?.type_client === "medecin",
      signIn,
      signOut,
    }),
    [session, userBase, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
et l'App.tsx est bon ? : 
// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages Auth
import Login from "./components/Login";
import Signup from "./components/Signup";
import SetInitialPassword from "./components/SetInitialPassword";

// Layouts
import SoignantLayout from "./components/layouts/SoignantLayout";
import MedecinLayout from "./components/layouts/MedecinLayout";

// Soignant
import PatientsList from "./components/soignant/PatientsList";
import PatientDetail from "./components/soignant/PatientDetail";
import DossierDetail from "./components/soignant/DossierDetail";
import EffectifDuJour from "./components/soignant/EffectifDuJour";
import Dashboard, { Filters as DashboardFilters } from "./components/soignant/Dashboard";
import Settings from "./components/soignant/Settings";
import AdminAnalytics from "./components/soignant/AdminAnalytics";
import TicketsCollaborateur from "./components/soignant/TicketsCollaborateur";
import TicketsAdmin from "./components/soignant/TicketsAdmin";
import Planning from "./components/soignant/Planning";

// Médecin
import RendezVousList from "./components/medecin/RendezVousList";

// Types
import { supabase, PatientCipher as Patient, DossierSoins as DossierSoin } from "./lib/supabase";

type SoignantView =
  | "dashboard"
  | "analyse"
  | "patients"
  | "effectif"
  | "planning"
  | "settings"
  | "tickets_collab"
  | "tickets_admin";

// --- utilitaire pour lire le hash Supabase
function parseHash(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const out: Record<string, string> = {};
  params.forEach((v, k) => (out[k] = v));
  return out;
}

function AppContent() {
  const { user, userBase, loading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  // navigation soignant
  const [currentView, setCurrentView] = useState<SoignantView>("patients");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<DossierSoin | null>(null);
  const [dashOverrideFilters, setDashOverrideFilters] = useState<DashboardFilters | null>(null);
  const hasInitialized = useRef(false);

  const isAdmin = userBase?.type_utilisateur === "admin";
  const isAssistant = userBase?.type_utilisateur === "assistant";

  // détection des liens d'invitation/récupération
  const [authType, setAuthType] = useState<"invite" | "recovery" | null>(null);
  useEffect(() => {
    const h = parseHash();
    const t = (h["type"] as "invite" | "recovery" | undefined) || null;
    if (t === "invite" || t === "recovery") setAuthType(t);
  }, []);

  // vue par défaut soignant
  useEffect(() => {
    if (loading || !userBase) return;
    if (!hasInitialized.current) {
      let startView: SoignantView = "patients";
      if (isAdmin) startView = "analyse";
      else if (isAssistant) startView = "effectif";
      else startView = "patients";
      setCurrentView(startView);
      hasInitialized.current = true;
    }
  }, [loading, userBase, isAdmin, isAssistant]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // cas 1 : lien d’invitation ou de réinitialisation
  if (authType && user) {
    return <SetInitialPassword mode={authType} onDone={() => setAuthType(null)} />;
  }

  // cas 2 : non connecté
  if (!user || !userBase) {
    hasInitialized.current = false;
    return showSignup ? (
      <Signup onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  /** navigation principale */
  const handleNavigate = (view: string) => {
    setCurrentView(view as SoignantView);
    setSelectedPatient(null);
    setSelectedDossier(null);
    if (view === "dashboard") setDashOverrideFilters(null);
  };

  /** sélections patients / dossiers */
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedDossier(null);
  };
  const handleSelectDossier = (dossier: DossierSoin) => {
    setSelectedDossier(dossier);
  };
  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setSelectedDossier(null);
  };
  const handleBackToDossiers = () => {
    setSelectedDossier(null);
  };

  /** ouverture via tickets */
  const openPatientById = async (patientId: string) => {
    const { data } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
    if (data) {
      setSelectedPatient(data as Patient);
      setSelectedDossier(null);
      setCurrentView("patients");
    }
  };

  const openDossierById = async (dossierId: string) => {
    const { data: dossier } = await supabase.from("dossiers_soins").select("*").eq("id", dossierId).maybeSingle();
    if (dossier) {
      const { data: patient } = await supabase.from("patients").select("*").eq("id", dossier.patient_id).maybeSingle();
      if (patient) {
        setSelectedPatient(patient as Patient);
        setSelectedDossier(dossier as DossierSoin);
        setCurrentView("patients");
      }
    }
  };

  /** depuis analytics vers dashboard */
  const openDashboardWithFilters = (filters: DashboardFilters) => {
    setDashOverrideFilters(filters);
    setCurrentView("dashboard");
  };

  /** rendu logique côté soignant */
  const renderSoignantContent = () => {
    if (selectedDossier && selectedPatient) {
      return <DossierDetail dossier={selectedDossier} patient={selectedPatient} onBack={handleBackToDossiers} />;
    }

    if (selectedPatient) {
      return <PatientDetail patient={selectedPatient} onBack={handleBackToPatients} onSelectDossier={handleSelectDossier} />;
    }

    switch (currentView) {
      case "dashboard":
        return isAdmin ? (
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

      case "analyse":
        return isAdmin ? <AdminAnalytics onOpenDashboardWithFilters={openDashboardWithFilters} /> : <PatientsList onSelectPatient={handleSelectPatient} />;

      case "patients":
        return <PatientsList onSelectPatient={handleSelectPatient} />;

      case "effectif":
        return (
          <EffectifDuJour
            onOpenDossier={(dossier, patient) => {
              setSelectedPatient(patient);
              setSelectedDossier(dossier);
              setCurrentView("patients");
            }}
          />
        );

      case "planning":
        return (
          <Planning
            onOpenDossier={(dossier, patient) => {
              setSelectedPatient(patient);
              setSelectedDossier(dossier);
              setCurrentView("patients");
            }}
          />
        );

      case "settings":
        return isAdmin ? <Settings /> : <PatientsList onSelectPatient={handleSelectPatient} />;

      case "tickets_collab":
        return userBase.type_utilisateur !== "admin" ? (
          <TicketsCollaborateur onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
        ) : (
          <PatientsList onSelectPatient={handleSelectPatient} />
        );

      case "tickets_admin":
        return isAdmin ? <TicketsAdmin onOpenPatient={openPatientById} onOpenDossier={openDossierById} /> : <PatientsList onSelectPatient={handleSelectPatient} />;

      default:
        return <PatientsList onSelectPatient={handleSelectPatient} />;
    }
  };

  // ==== rendu final ====
  if (userBase.type_client === "soignant") {
    return (
      <SoignantLayout currentView={currentView} onNavigate={handleNavigate}>
        {renderSoignantContent()}
      </SoignantLayout>
    );
  }

  if (userBase.type_client === "medecin") {
    return (
      <MedecinLayout currentView={currentView} onNavigate={setCurrentView}>
        {currentView === "rendezvous" && <RendezVousList />}
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