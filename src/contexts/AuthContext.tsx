// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserBase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  userBase: UserBase | null;
  loading: boolean;
  lastBusinessError: string | null; // ex: 'INACTIVE_CLIENT'
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userBase, setUserBase] = useState<UserBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastBusinessError, setLastBusinessError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // 1) S'abonner aux changements d'auth (connexion / déconnexion / refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadUserBase(session.user.id);
      } else {
        setUserBase(null);
        setLastBusinessError(null);
        setLoading(false); // 👈 ne jamais bloquer l'UI
      }
    });

    // 2) Session initiale (ne JAMAIS bloquer si erreur)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        setUser(session?.user ?? null);
        if (session?.user) {
          await loadUserBase(session.user.id);
        }
      } catch (e) {
        console.error('[auth.getSession] failed:', e);
        // En cas de refresh token invalide : on laisse l’UI afficher Login.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadUserBase = async (userId: string) => {
    // Note: on évite un "loading" global prolongé ici pour garder l’UI réactive.
    setLastBusinessError(null);
    try {
      // 1) Lire users_base
      const { data: ub, error: ubErr } = await supabase
        .from('users_base')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (ubErr) throw ubErr;
      setUserBase(ub ?? null);

      // 2) Vérifier le client actif UNIQUEMENT si admin (RLS restreint pour assistants)
      if (ub?.client_id && ub?.type_utilisateur === 'admin') {
        const { data: cli, error: cliErr } = await supabase
          .from('clients')
          .select('statut')
          .eq('id', ub.client_id)
          .maybeSingle();
        if (cliErr) throw cliErr;

        if (cli?.statut === 'inactif') {
          setLastBusinessError('INACTIVE_CLIENT');
          await supabase.auth.signOut();
          setUserBase(null);
        }
      }
    } catch (error) {
      console.error('Erreur chargement profil utilisateur:', error);
      // On ne bloque pas l’UI : pas de setLoading(true) ici.
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange => loadUserBase
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } finally {
      setLastBusinessError(null);
      setUserBase(null);
      setUser(null);
      // Pas de reload ici : laisse App décider (ou ajoute un redirect si tu veux).
    }
  };

  return (
    <AuthContext.Provider value={{ user, userBase, loading, lastBusinessError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
