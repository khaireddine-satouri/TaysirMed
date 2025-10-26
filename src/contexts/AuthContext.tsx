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
import { useKeys } from "./KeyManager.tsx";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  userBase: UserBase | null;
  loading: boolean;
  authReady: boolean; // session + userBase connus (pas la DEK)
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
  authReady: false,
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
  const keys = useKeys(); // contient DEK (en mémoire) + méthodes

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        setSession(data.session ?? null);

        if (data.session?.user) {
          await loadUserBase(data.session.user.id);
        } else {
          setUserBase(null);
        }
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess ?? null);

        if (!sess?.user) {
          setUserBase(null);
          keys.clear(); // purge DEK mémoire
          return;
        }

        try {
          await loadUserBase(sess.user.id);
        } catch {
          // évite de faire planter l'effet
        }
        // NB: deriveAndLoad non appelé ici (il faut le mot de passe).
      })();
    });

    return () => {
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserBase = async (uid: string) => {
    const { data, error } = await supabase
      .from("users_base")
      .select(
        "id, nom, prenom, type_utilisateur, type_client, client_id, created_at, updated_at"
      )
      .eq("id", uid)
      .maybeSingle();

    if (error) throw error;
    setUserBase((data as UserBase) ?? null);
  };

  const signIn = async (email: string, password: string) => {
    // 1) Auth Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // 2) Vérif tenant
    if (data.user) {
      const { data: ub, error: ubErr } = await supabase
        .from("users_base")
        .select("client_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (ubErr) {
        await supabase.auth.signOut();
        throw ubErr;
      }

      if (ub?.client_id) {
        const { data: client, error: clientErr } = await supabase
          .from("clients")
          .select("statut")
          .eq("id", ub.client_id)
          .maybeSingle();

        if (clientErr) {
          await supabase.auth.signOut();
          const e = new Error("CLIENT_READ_FAILED");
          (e as any).cause = clientErr;
          throw e;
        }
        if (client?.statut === "inactif") {
          await supabase.auth.signOut();
          const err = new Error("INACTIVE_CLIENT");
          (err as any).code = "INACTIVE_CLIENT";
          throw err;
        }
      }
    }

    // 3) 🔐 dériver KEK & déverrouiller DEK
    try {
      await keys.deriveAndLoad(password, data.user!.id);
    } catch (e) {
      await supabase.auth.signOut();
      const err = new Error("KEY_DERIVATION_FAILED"); // ex: mauvais mot de passe, matériel manquant
      (err as any).cause = e;
      throw err;
    }

    // 4) Hydrater userBase
    await loadUserBase(data.user!.id);
  };

  const signOut = async () => {
    keys.clear(); // purge DEK
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUserBase(null);
    setSession(null);
  };

  const value: AuthContextType = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      userBase,
      loading,
      authReady: !loading && !!session && !!userBase,
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
