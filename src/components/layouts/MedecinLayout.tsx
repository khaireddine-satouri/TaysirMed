// src/components/layouts/MedecinLayout.tsx
import { ReactNode, useState } from "react";
import {
  LogOut,
  Users,
  CalendarRange,
  Settings,
  Calendar,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

interface MedecinLayoutProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
  clinicName?: string;
  showCharter?: boolean;
  onAcceptCharter?: () => void;
  onRefuseCharter?: () => void;
}

export default function MedecinLayout({
  children,
  currentView,
  onNavigate,
  clinicName,
  showCharter = false,
  onAcceptCharter,
  onRefuseCharter,
}: MedecinLayoutProps) {
  const { userBase, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const isAdmin = userBase?.type_utilisateur === "admin";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      console.error("Erreur déconnexion:", e);
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-blue-600">
              {clinicName?.trim() || "TaysirMed"}
            </h1>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {userBase?.prenom} {userBase?.nom}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {userBase?.type_utilisateur}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Déconnexion"
                className="p-3 sm:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition active:scale-[0.98]"
                title="Déconnexion"
              >
                <LogOut className="w-6 h-6 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 py-2">
            <button
              type="button"
              onClick={() => onNavigate("rdv")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                currentView === "rdv"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              Rendez-vous
            </button>

            <button
              type="button"
              onClick={() => onNavigate("patients")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                currentView === "patients"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Users className="w-4 h-4" />
              Patients
            </button>

            <button
              type="button"
              onClick={() => onNavigate("planning")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                currentView === "planning"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
              title="Agenda complet"
            >
              <Calendar className="w-4 h-4" />
              Planning
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onNavigate("settings")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                  currentView === "settings"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Settings className="w-4 h-4" />
                Paramètres
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Modal Charte (optionnel) */}
      {showCharter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl border">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Charte d’utilisation</h3>
              <button
                type="button"
                onClick={onRefuseCharter}
                className="p-2 rounded hover:bg-gray-100"
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Texte de la charte à compléter */}
              <div className="prose prose-sm max-w-none text-gray-700" />
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t">
              <button
                type="button"
                onClick={onRefuseCharter}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={onAcceptCharter}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                J’accepte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
