// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase, UserBase } from "../lib/supabase";

type TypeClient = "soignant" | "medecin";
type TypeUtilisateur = "admin" | "assistant" | "secretaire";

type Profile = UserBase;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
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
  profile: null,
  loading: true,
  isAdmin: false,
  isSoignant: false,
  isMedecin: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess?.user) {
        setProfile(null);
      } else {
        loadProfile(sess.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from("users_base")
      .select("id, nom, prenom, type_utilisateur, type_client, client_id, created_at, updated_at")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
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
      profile,
      loading,
      isAdmin: profile?.type_utilisateur === "admin",
      isSoignant: profile?.type_client === "soignant",
      isMedecin: profile?.type_client === "medecin",
      signIn,
      signOut,
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
