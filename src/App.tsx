// src/App.tsx
import { useEffect, useRef, useState, useMemo } from "react";
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

// Types + supabase
import { supabase, PatientCipher as Patient, DossierSoins as DossierSoin } from "./lib/supabase";

/**
 * 🔐 Service de clés côté client
 * Assumptions:
 * - KeyService.bootstrapDEK() : tente de récupérer un share pour device courant et déverrouiller la DEK.
 *   -> return { ok: true } si prêt
 *   -> throw { code: 'MISSING_SHARE', deviceId } si pas de share pour cet appareil
 *   -> throw Error(...) pour toute autre erreur
 * - KeyService.getPairingPayload() : retourne { user_id, device_id, nonce } pour affichage/copie
 * - KeyService.refreshAfterPairing() : retente un bootstrap (utilisé après appairage)
 */
import * as KeyService from "./crypto/KeyService";

type SoignantView =
  | "dashboard"
  | "analyse"
  | "patients"
  | "effectif"
  | "planning"
  | "settings"
  | "tickets_collab"
  | "tickets_admin";

/** Lis proprement les paramètres d’URL : on gère à la fois ?type=... et #type=... */
function parseAuthParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};

  // 1) query string (?type=invite|recovery)
  const search = new URLSearchParams(window.location.search);
  search.forEach((v, k) => (out[k] = v));

  // 2) hash (#type=invite|recovery&...)
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  hashParams.forEach((v, k) => {
    if (!out[k]) out[k] = v;
  });

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
    const p = parseAuthParams();
    const t = (p["type"] as "invite" | "recovery" | undefined) || null;
    if (t === "invite" || t === "recovery") setAuthType(t);
  }, []);

  // 🔐 état bootstrap des clés locales / DEK
  const [keysState, setKeysState] = useState<
    { status: "idle" | "bootstrapping" | "ready" | "missing_share" | "error"; message?: string; deviceId?: string }
  >({ status: "idle" });

  // Bootstrap DEK dès que l’utilisateur est connecté, hors page SetInitialPassword
  useEffect(() => {
    const run = async () => {
      if (loading) return;
      // si pas de user => rien à faire ici
      if (!user || !userBase) return;

      // ne pas démarrer le bootstrap quand on set le mot de passe (invite/recovery)
      const p = parseAuthParams();
      const t = (p["type"] as "invite" | "recovery" | undefined) || null;
      if (t === "invite" || t === "recovery") return;

      setKeysState({ status: "bootstrapping" });
      try {
        const res = await KeyService.bootstrapDEK();
        if (res?.ok) {
          setKeysState({ status: "ready" });
        } else {
          setKeysState({ status: "error", message: "État inattendu du bootstrap." });
        }
      } catch (e: any) {
        if (e?.code === "MISSING_SHARE") {
          setKeysState({ status: "missing_share", deviceId: e?.deviceId });
        } else {
          setKeysState({ status: "error", message: e?.message || "Erreur initialisation sécurité." });
        }
      }
    };
    run();
  }, [loading, user, userBase]);

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

  // === états de chargement / auth ===
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // cas 1 : lien d’invitation ou de réinitialisation (affiche le composant de MDP initial)
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

  // cas 3 : utilisateur connecté mais DEK pas prête
  if (keysState.status === "bootstrapping") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="text-gray-700">Initialisation de la sécurité…</p>
        </div>
      </div>
    );
  }

  if (keysState.status === "missing_share") {
    return <PairingScreen deviceId={keysState.deviceId} onRetry={async () => {
      setKeysState({ status: "bootstrapping" });
      try {
        const res = await KeyService.refreshAfterPairing();
        if (res?.ok) setKeysState({ status: "ready" });
        else setKeysState({ status: "error", message: "État inattendu du bootstrap." });
      } catch (e: any) {
        if (e?.code === "MISSING_SHARE") setKeysState({ status: "missing_share", deviceId: e?.deviceId });
        else setKeysState({ status: "error", message: e?.message || "Erreur initialisation sécurité." });
      }
    }} />;
  }

  if (keysState.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Erreur d’initialisation</h2>
          <p className="text-sm text-gray-700">{keysState.message || "Une erreur inconnue est survenue."}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Ici, l’utilisateur est connecté ET la clé (DEK) est prête ===

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
        return isAdmin ? (
          <AdminAnalytics onOpenDashboardWithFilters={openDashboardWithFilters} />
        ) : (
          <PatientsList onSelectPatient={handleSelectPatient} />
        );

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
        return isAdmin ? (
          <TicketsAdmin onOpenPatient={openPatientById} onOpenDossier={openDossierById} />
        ) : (
          <PatientsList onSelectPatient={handleSelectPatient} />
        );

      default:
        return <PatientsList onSelectPatient={handleSelectPatient} />;
    }
  };

  // ==== rendu final par type de client ====
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

/* ============================================================
 * Écran d’appairage quand le share DEK du device est manquant
 * ============================================================ */
function PairingScreen({ deviceId, onRetry }: { deviceId?: string; onRetry: () => Promise<void> }) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const p = await KeyService.getPairingPayload(); // { user_id, device_id, nonce }
        setPayload(JSON.stringify(p, null, 2));
      } catch {
        setPayload(JSON.stringify({ user_id: user?.id, device_id: deviceId || "unknown" }, null, 2));
      }
    })();
  }, [user?.id, deviceId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-50 via-white to-blue-50">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Appairer cet appareil</h1>
        <p className="text-gray-700">
          Pour déverrouiller les données chiffrées, validez cet appareil depuis un autre appareil déjà approuvé
          (ou demandez à un admin autorisé). Collez ou scannez le “code d’appairage” ci-dessous sur l’appareil approuvé.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <pre className="text-xs overflow-auto leading-5">{payload}</pre>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(payload)}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
          >
            Copier
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition"
          >
            J’ai appairé — Réessayer
          </button>
        </div>

        <div className="text-sm text-gray-600">
          <p>
            ID de l’appareil : <span className="font-mono">{deviceId || "inconnu"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
