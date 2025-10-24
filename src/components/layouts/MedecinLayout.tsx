// src/components/layouts/MedecinLayout.tsx
import { ReactNode, useEffect, useState } from "react";
import { Calendar, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

interface LayoutProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function MedecinLayout({ children, currentView, onNavigate }: LayoutProps) {
  const { userBase, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [clientName, setClientName] = useState<string>("");

  const clientId = userBase?.client_id ?? null;

  // Charger le nom du cabinet
  useEffect(() => {
    if (!clientId) return;
    const loadClient = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("nom")
        .eq("id", clientId)
        .maybeSingle();
      if (!error && data) {
        setClientName(data.nom);
      }
    };
    loadClient();
  }, [clientId]);

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
            <h1 className="text-xl font-bold text-teal-600">
              {clientName ? clientName : "Cabinet"}
            </h1>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {userBase?.prenom} {userBase?.nom}
                </p>
                <p className="text-xs text-gray-500 capitalize">{userBase?.type_utilisateur}</p>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="p-3 sm:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
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
            <NavButton
              icon={<Calendar className="w-4 h-4" />}
              label="Rendez-vous"
              view="rendezvous"
              currentView={currentView}
              onNavigate={onNavigate}
            />
            {/* Plus tard: dossiers, patients, analytics, etc. */}
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}

// Bouton navigation générique
function NavButton({
  icon,
  label,
  view,
  currentView,
  onNavigate,
}: {
  icon: ReactNode;
  label: string;
  view: string;
  currentView: string;
  onNavigate: (view: string) => void;
}) {
  const isActive = currentView === view;
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
        isActive ? "bg-teal-50 text-teal-700" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
