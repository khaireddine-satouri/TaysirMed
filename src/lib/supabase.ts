// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Types de base (V2)
 */
export type ClientType = 'soignant' | 'medecin';
export type UserRole = 'admin' | 'assistant' | 'secretaire';

export interface Client {
  id: string;
  nom: string;                                // "Nom Prenom" à la création
  statut: 'actif' | 'inactif';
  type_client: ClientType;                    // ⬅️ V2
  created_at: string | null;
  updated_at: string | null;
}

export interface UserBase {
  id: string;                                 // = auth.users.id
  nom: string;
  prenom: string;
  type_utilisateur: UserRole;                 // ⬅️ V2 (admin/assistant/secretaire)
  client_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * (Legacy v1) – tu peux les garder si des écrans V1 les utilisent encore.
 * Pour la V2 (données chiffrées), l’app fera ses propres DTO côté UI si besoin.
 */
export interface Patient {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone_2?: string | null;
  photo_url: string | null;
  photo_path?: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DossierSoinV1 {
  id: string;
  patient_id: string;
  motif: string;
  commentaire: string;
  nombre_seances: number;
  pec_cnam: boolean;
  etat_pec: 'en_cours' | 'depose' | null;
  prix_par_seance: number;
  date_debut: string | null;
  date_fin: string | null;
  etat: 'a_venir' | 'en_cours' | 'termine';
  est_actif?: boolean | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface SeanceV1 {
  id: string;
  dossier_id: string;
  numero_seance: number;
  date_seance: string;
  prestataire_id: string;
  montant_paye: number;
  note: string | null;
  created_at: string;
}

export interface DocumentV1 {
  id: string;
  dossier_id: string;
  nom: string;
  type_fichier: 'photo' | 'pdf';
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * Helpers “signup” – côté front
 *
 * ⚠️ IMPORTANT
 * Pour respecter tes RLS (pas d’INSERT direct sur clients/users_base),
 * on appelle une RPC Postgres (SECURITY DEFINER) que tu vas créer côté DB :
 *
 *   create or replace function public.bootstrap_tenant_admin(
 *     p_email text,
 *     p_user_id uuid,
 *     p_nom text,
 *     p_prenom text,
 *     p_type_client text  -- 'soignant' | 'medecin'
 *   ) returns uuid ...
 *
 * Cette RPC doit :
 *   1) créer le client (nom = "Nom Prenom", type_client)
 *   2) insérer users_base (id = p_user_id, type_utilisateur='admin', client_id = nouveau client)
 *   3) retourner client_id
 *
 * Tu peux me demander le script si tu veux, je l’ai prêt.
 */
export async function signUpAndBootstrapTenant(params: {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  type_client: ClientType;
}) {
  const { email, password, nom, prenom, type_client } = params;

  // 1) Création du compte Auth
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // on pousse aussi des métadonnées utiles aux triggers éventuels
      data: {
        nom,
        prenom,
        type_utilisateur: 'admin',
        // type_client est utilisé par la RPC (source de vérité = DB)
        wanted_type_client: type_client,
        // utile si email confirmations actives => redirection
        // (ajuste l’URL à ton domaine)
        // redirectTo: `${window.location.origin}/login`
      },
    },
  });
  if (signUpError) throw signUpError;

  const userId = signUpData.user?.id;
  if (!userId) {
    // si confirmation e-mail est activée, l’utilisateur n’est pas connecté ici
    // on arrête proprement : la RPC se fera après confirmation dans un écran dédié si besoin
    return { userId: null, clientId: null, needsEmailConfirmation: true };
  }

  // 2) Bootstrap tenant via RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('bootstrap_tenant_admin', {
    p_email: email,
    p_user_id: userId,
    p_nom: nom,
    p_prenom: prenom,
    p_type_client: type_client,
  });

  if (rpcErr) throw rpcErr;

  return {
    userId,
    clientId: rpcData as string | null,
    needsEmailConfirmation: false,
  };
}
