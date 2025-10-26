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

// 🔐 Key management (DEK en mémoire, dérivée/chargée au signIn)
import { useKeys } from "./KeyManager";

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

  // 🔐 accès au KeyManager (contient la DEK en mémoire, jamais persistée)
  const keys = useKeys();

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        setSession(data.session ?? null);

        if (data.session?.user) {
          await loadUserBase(data.session.user.id);
          // ⚠️ Ici on ne connaît pas le mot de passe ⇒ pas de deriveAndLoad.
          // La DEK sera initialisée soit via signIn(password), soit via SetInitialPassword.
        } else {
          setUserBase(null);
        }
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess ?? null);

      if (!sess?.user) {
        setUserBase(null);
        // 🔐 Purge mémoire à la déconnexion
        keys.clear();
        return;
      }

      // Mise à jour du userBase au changement d’état (ex: refresh du token, recovery complété)
      await loadUserBase(sess.user.id);
      // ⚠️ Ne PAS appeler deriveAndLoad ici : il faut le mot de passe clair.
    });

    return () => {
      try {
        sub?.subscription?.unsubscribe();
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

  /**
   * Authentifie l'utilisateur via Supabase, vérifie que son client est actif,
   * puis 🔐 dérive le KEK à partir du mot de passe et déverrouille la DEK (KeyManager).
   * La DEK reste en mémoire (jamais persistée).
   */
  const signIn = async (email: string, password: string) => {
    // 1) Auth Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // 2) Vérification du client (tenant) actif
    if (data.user) {
      const { data: ub, error: ubErr } = await supabase
        .from("users_base")
        .select("client_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (ubErr) {
        // on se déconnecte proprement si l'appel échoue
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

    // 3) 🔐 Dérivation & chargement de la DEK via KeyManager
    try {
      await keys.deriveAndLoad(password, data.user!.id);
    } catch (e) {
      // Si l'étape crypto échoue : on nettoie tout et on renvoie une erreur claire
      await supabase.auth.signOut();
      const err = new Error("KEY_DERIVATION_FAILED");
      (err as any).cause = e;
      throw err;
    }

    // 4) Hydrate le userBase (utile quand signIn est appelé depuis un écran de login)
    await loadUserBase(data.user!.id);
  };

  /**
   * Déconnexion : purge la DEK en mémoire puis signOut Supabase.
   */
  const signOut = async () => {
    // 🔐 purge mémoire
    keys.clear();

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // reset local state
    setUserBase(null);
    setSession(null);
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
