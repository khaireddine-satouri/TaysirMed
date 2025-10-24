// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Auth pages
import Login from "./components/Login";
import Signup from "./components/Signup";

// Layouts
import SoignantLayout from "./components/layouts/SoignantLayout";
import MedecinLayout from "./components/layouts/MedecinLayout";

// Médecin
import RendezVousList from "./components/medecin/RendezVousList";

// Soignant (V1 existants, déplacés dans /soignant)
import Dashboard from "./components/soignant/Dashboard";
import PatientsList from "./components/soignant/PatientsList";
import PatientDetail from "./components/soignant/PatientDetail";
import DossierDetail from "./components/soignant/DossierDetail";
import Planning from "./components/soignant/Planning";
import Settings from "./components/soignant/Settings";
import TicketsAdmin from "./components/soignant/TicketsAdmin";
import TicketsCollaborateur from "./components/soignant/TicketsCollaborateur";

/* --------------------------------------------------------------------------------
 * Gates (mini-protecteurs locaux, pour rester self-contained dans App.tsx)
 * -------------------------------------------------------------------------------- */
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function ClientGate({
  allow,
  children,
}: {
  allow: Array<"soignant" | "medecin">;
  children: JSX.Element;
}) {
  const { loading, profile } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!profile) return <Navigate to="/login" replace />;
  if (!allow.includes(profile.type_client)) return <Navigate to="/" replace />;
  return children;
}

function RoleGate({
  allow,
  children,
}: {
  allow: Array<"admin" | "assistant" | "secretaire">;
  children: JSX.Element;
}) {
  const { loading, profile } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!profile) return <Navigate to="/login" replace />;
  if (!allow.includes(profile.type_utilisateur)) return <Navigate to="/" replace />;
  return children;
}

/* --------------------------------------------------------------------------------
 * Charte: s'affiche à la première connexion ; si refus ➜ la charte réapparaitra
 * à chaque nouvelle connexion jusqu’à acceptation. (texte vide pour l’instant)
 * -------------------------------------------------------------------------------- */
function CharterGate() {
  const { user } = useAuth();
  const storageKey = useMemo(() => (user ? `charter:${user.id}:accepted` : ""), [user?.id]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const accepted = localStorage.getItem(storageKey);
    // si jamais non accepté, on ouvre
    if (accepted !== "true") setOpen(true);
  }, [user, storageKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(680px,95vw)] rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold mb-3">Charte d’utilisation</h2>
        {/* Texte volontairement vide comme demandé */}
        <div className="prose prose-sm max-w-none min-h-[160px] p-3 border rounded bg-gray-50">
          {/* contenu à venir */}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Vous devez accepter pour ne plus revoir cette charte aux prochaines connexions.
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded border hover:bg-gray-50"
              onClick={() => {
                // Refuser: on ne marque rien en localStorage -> elle reviendra au prochain login
                setOpen(false);
              }}
            >
              Refuser
            </button>
            <button
              className="px-3 py-2 rounded bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => {
                if (storageKey) localStorage.setItem(storageKey, "true");
                setOpen(false);
              }}
            >
              Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------
 * Page de redirection selon type_client
 * -------------------------------------------------------------------------------- */
function LandingRedirect() {
  const { loading, isSoignant, isMedecin, session } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (isSoignant) return <Navigate to="/soignant" replace />;
  if (isMedecin) return <Navigate to="/medecin/consultations" replace />;
  return (
    <div className="p-6">
      Profil incomplet. <Link className="underline" to="/login">Se reconnecter</Link>
    </div>
  );
}

/* --------------------------------------------------------------------------------
 * Tickets router (admin -> TicketsAdmin, sinon -> TicketsCollaborateur)
 * -------------------------------------------------------------------------------- */
function TicketsRouter() {
  const { isAdmin } = useAuth();
  return isAdmin ? <TicketsAdmin /> : <TicketsCollaborateur />;
}

/* --------------------------------------------------------------------------------
 * Loader simple
 * -------------------------------------------------------------------------------- */
function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
    </div>
  );
}

/* --------------------------------------------------------------------------------
 * App
 * -------------------------------------------------------------------------------- */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* La Charte se monte globalement une fois l'utilisateur connecté */}
        <CharterGate />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Root: envoie vers layout approprié */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <LandingRedirect />
              </ProtectedRoute>
            }
          />

          {/* ================== SOIGNANT ================== */}
          <Route
            path="/soignant"
            element={
              <ProtectedRoute>
                <ClientGate allow={["soignant"]}>
                  <SoignantLayout />
                </ClientGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<PatientsList />} />
            <Route path="patients/:id" element={<PatientDetail />} />
            <Route path="dossiers/:id" element={<DossierDetail />} />
            <Route path="planning" element={<Planning />} />
          </Route>

          {/* ================== MEDECIN ================== */}
          <Route
            path="/medecin"
            element={
              <ProtectedRoute>
                <ClientGate allow={["medecin"]}>
                  <MedecinLayout />
                </ClientGate>
              </ProtectedRoute>
            }
          >
            {/* par défaut: liste des prochains rendez-vous (peut être vide) */}
            <Route index element={<Navigate to="consultations" replace />} />
            <Route path="consultations" element={<RendezVousList />} />
            {/* à venir: patients / dossiers médicaux */}
            {/* <Route path="patients" element={<PatientsList />} /> */}
            {/* <Route path="patients/:id" element={<PatientDetail />} /> */}
            {/* <Route path="dossiers" element={<DossiersMedecinList />} /> */}
            {/* <Route path="dossiers/:id" element={<DossierMedecinDetail />} /> */}
          </Route>

          {/* ================== COMMUNS ================== */}
          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <TicketsRouter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <RoleGate allow={["admin"]}>
                  <Settings />
                </RoleGate>
              </ProtectedRoute>
            }
          />

          {/* 404 -> home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
