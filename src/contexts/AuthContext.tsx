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
