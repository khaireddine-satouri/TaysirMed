// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserBase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  userBase: UserBase | null;
  loading: boolean;
  lastBusinessError: string | null; // <-- pour différencier erreurs métier
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
      let { data: ub, error: ubErr } = await supabase
        .from('users_base')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // 2) Si absent (latence du trigger ou 1er passage), tenter le bootstrap
      if ((!ub || ubErr) && userId) {
        await supabase.rpc('ensure_bootstrap_for_user', {
          p_user_id: userId,
          p_nom: '',
          p_prenom: '',
          p_type_client: null
        }).catch(() => { /* ignore: idempotent */ });

        const retry = await supabase
          .from('users_base')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        ub = retry.data ?? null;
        ubErr = retry.error ?? null;
      }

      if (ubErr) throw ubErr;
      setUserBase(ub);

      // 3) Vérifier le client actif (si on a un client_id)
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
      // Erreurs ici ≠ mauvais mot de passe
      console.error('Erreur chargement profil utilisateur:', error);
      // on garde user sessionné mais sans profil; l’app peut proposer de réessayer
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    // IMPORTANT: on ne fait que l’auth ici. Pas de logique métier → pas d’erreur sur les cred valides
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Ces erreurs-là sont réellement “identifiants invalides”
      throw error;
    }
    // le onAuthStateChange se chargera de charger users_base / client / etc.
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
