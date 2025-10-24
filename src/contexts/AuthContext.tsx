// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserBase(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserBase(session.user.id);
      } else {
        setUserBase(null);
        setLastBusinessError(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserBase = async (userId: string) => {
    setLoading(true);
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

      // 2) Vérifier le client actif (si on a un client_id)
      if (ub?.client_id) {
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
      // On n'écrase pas user ici ; l’app pourra afficher un message ou proposer un refresh.
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange se chargera de charger users_base / clients / etc.
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setLastBusinessError(null);
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
