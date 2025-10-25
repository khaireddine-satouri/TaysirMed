// src/contexts/AuthContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
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

  // --- utilitaire: parser le hash d’URL
  function parseHash(): Record<string, string> {
    if (typeof window === "undefined") return {};
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(raw);
    const out: Record<string, string> = {};
    params.forEach((v, k) => (out[k] = v));
    return out;
  }

  useEffect(() => {
    const init = async () => {
      // 🔑 Étape 1: vérifier si on a reçu des tokens (invite / recovery)
      const h = parseHash();
      const access_token = h["access_token"];
      const refresh_token = h["refresh_token"];

      if (access_token && refresh_token) {
        // setSession manuellement (important pour le flux d’invitation)
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (!error) {
          setSession(data.session ?? null);
          if (data.session?.user) {
            await loadUserBase(data.session.user.id);
          }
          // ⚡ nettoyer le hash pour éviter que ça rejoue
          window.history.replaceState({}, "", window.location.pathname);
          setLoading(false);
          return;
        }
      }

      // 🔑 Étape 2: cas normal (pas de hash → session persistée)
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      if (data.session?.user) {
        await loadUserBase(data.session.user.id);
      }
      setLoading(false);
    };

    init();

    // 🔑 Étape 3: écouter les changements d’état
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
      .select(
        "id, nom, prenom, type_utilisateur, type_client, client_id, created_at, updated_at"
      )
      .eq("id", uid)
      .maybeSingle();

    setUserBase((data as UserBase) ?? null);
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
