// src/components/layouts/SoignantLayout.tsx
import { ReactNode, useEffect, useState } from "react";
import {
  Send,
  Inbox,
  Bell,
  LogOut,
  Users,
  FileText,
  Calendar,
  Settings,
  BarChart3,
  CalendarRange,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { useNewTicketsIndicator } from "../../hooks/useNewTicketsIndicator";

interface LayoutProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function SoignantLayout({ children, currentView, onNavigate }: LayoutProps) {
  const { userBase, isAdmin, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const clientId = userBase?.client_id ?? null;

  const [clientName, setClientName] = useState<string>("");
  const [hasAssistants, setHasAssistants] = useState<boolean | null>(null);

  // Compteur des nouveaux tickets (admin)
  const { count: newTicketsCount, markAsSeen } = useNewTicketsIndicator(clientId, isAdmin);
  const showTicketsUI = isAdmin && hasAssistants === true;

  // Charger le nom du client dynamiquement
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

  // Vérifier s’il existe au moins un assistant dans ce client (visible uniquement pour admin)
  useEffect(() => {
    let cancelled = false;

    const checkAssistants = async () => {
      if (!isAdmin || !clientId) {
        setHasAssistants(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("users_base")
          .select("id")
          .eq("client_id", clientId)
          .eq("type_utilisateur", "assistant")
          .limit(1);

        if (cancelled) return;
        if (error) {
          console.error("Erreur vérification assistants:", error);
          setHasAssistants(false);
          return;
        }
        setHasAssistants((data?.length ?? 0) > 0);
      } catch (e) {
        if (!cancelled) {
          console.error("Erreur vérification assistants:", e);
          setHasAssistants(false);
        }
      }
    };

    checkAssistants();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, clientId]);

  // Rediriger si admin sans assistants et onglet tickets_admin actif
  useEffect(() => {
    if (isAdmin && hasAssistants === false && currentView === "tickets_admin") {
      onNavigate("analyse");
    }
  }, [isAdmin, hasAssistants, currentView, onNavigate]);

  // Marquer les tickets comme vus quand on arrive sur tickets_admin
  useEffect(() => {
    if (showTicketsUI && currentView === "tickets_admin") {
      markAsSeen();
    }
  }, [showTicketsUI, currentView, markAsSeen]);

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

  const goTicketsAdmin = async () => {
    if (!showTicketsUI) return;
    await markAsSeen();
    onNavigate("tickets_admin");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-teal-600">
              {clientName ? `${clientName}` : "Cabinet"}
            </h1>

            <div className="flex items-center gap-3">
              {/* Cloche de notifications (admin + a des assistants) */}
              {showTicketsUI && (
                <button
                  type="button"
                  onClick={goTicketsAdmin}
                  className="relative p-3 sm:p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                  title="Tickets collaborateurs"
                >
                  <Bell className="w-6 h-6 sm:w-5 sm:h-5" />
                  {newTicketsCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center">
                      {newTicketsCount > 99 ? "99+" : newTicketsCount}
                    </span>
                  )}
                </button>
              )}

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
            {/* Analyse (admin) */}
            {isAdmin && (
              <NavButton
                icon={<BarChart3 className="w-4 h-4" />}
                label="Analyse"
                view="analyse"
                currentView={currentView}
                onNavigate={onNavigate}
              />
            )}

            {/* Dashboard (admin) */}
            {isAdmin && (
              <NavButton
                icon={<FileText className="w-4 h-4" />}
                label="Tableau de bord"
                view="dashboard"
                currentView={currentView}
                onNavigate={onNavigate}
              />
            )}

            {/* Patients (tous) */}
            <NavButton
              icon={<Users className="w-4 h-4" />}
              label="Patients"
              view="patients"
              currentView={currentView}
              onNavigate={onNavigate}
            />

            {/* Séances du jour (tous) */}
            <NavButton
              icon={<Calendar className="w-4 h-4" />}
              label="Séances du jour"
              view="effectif"
              currentView={currentView}
              onNavigate={onNavigate}
            />

            {/* Planning (tous) */}
            <NavButton
              icon={<CalendarRange className="w-4 h-4" />}
              label="Planning"
              view="planning"
              currentView={currentView}
              onNavigate={onNavigate}
            />

            {/* Tickets collaborateur (assistants) */}
            {!isAdmin && (
              <NavButton
                icon={<Send className="w-4 h-4" />}
                label="Envoyer un ticket"
                view="tickets_collab"
                currentView={currentView}
                onNavigate={onNavigate}
              />
            )}

            {/* Tickets staff (admin + assistants présents) */}
            {showTicketsUI && (
              <NavButton
                icon={<Inbox className="w-4 h-4" />}
                label="Tickets staff"
                view="tickets_admin"
                currentView={currentView}
                onNavigate={onNavigate}
                badge={newTicketsCount}
              />
            )}

            {/* Paramètres (admin) */}
            {isAdmin && (
              <NavButton
                icon={<Settings className="w-4 h-4" />}
                label="Paramètres"
                view="settings"
                currentView={currentView}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
    </div>
  );
}

// Bouton de navigation factorisé
function NavButton({
  icon,
  label,
  view,
  currentView,
  onNavigate,
  badge,
}: {
  icon: ReactNode;
  label: string;
  view: string;
  currentView: string;
  onNavigate: (view: string) => void;
  badge?: number;
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
      {!!badge && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
