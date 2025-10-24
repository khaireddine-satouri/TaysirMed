// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Initialisation Supabase
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars. Check .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/* ======================================================================
 * Types de base (enums) — alignés avec le schema V2
 * ==================================================================== */

export type ClientStatut = "actif" | "inactif";
export type TypeUtilisateur = "admin" | "assistant" | "secretaire";
export type TypeClient = "soignant" | "medecin";

export type DossierEtat = "a_venir" | "en_cours" | "termine";
export type EtatPec = "en_cours" | "depose";
export type EtatSeance = "programmee" | "realisee";
export type TicketStatus = "non_traite" | "en_cours" | "traite";
export type ConsultationStatut = "planifiee" | "realisee" | "annulee" | "absent";

/** Recommandation: manipuler les colonnes *_ct (bytea) en Uint8Array côté front. */
export type Ciphertext = Uint8Array;

/* ======================================================================
 * Tables
 * ==================================================================== */

export interface Client {
  id: string;
  nom: string;
  statut: ClientStatut;
  created_at: string;
  updated_at: string;
}

export interface UserBase {
  id: string; // = auth.users.id
  nom: string;
  prenom: string;
  type_utilisateur: TypeUtilisateur;
  type_client: TypeClient;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Patients — données sensibles chiffrées (zero-knowledge) */
export interface PatientCipher {
  id: string;
  nom_ct: Ciphertext;
  prenom_ct: Ciphertext;
  telephone_ct: Ciphertext;
  telephone2_ct?: Ciphertext | null;
  created_by: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
}

/** Dossiers de soins (soignant) — champs sensibles chiffrés */
export interface DossierSoins {
  id: string;
  patient_id: string;
  motif_ct: Ciphertext;
  commentaire_ct?: Ciphertext | null;

  nombre_seances: number; // >= 0
  pec_cnam: boolean;
  prix_par_seance: number | null; // <-- pas de default (peut etre null)
  date_debut: string | null; // ISO date
  date_fin: string | null;   // ISO date
  etat: DossierEtat;
  etat_pec: EtatPec;
  est_actif: boolean;        // mis à jour par triggers
  est_paye: boolean | null;

  created_by: string | null;
  updated_by: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
}

export interface Seance {
  id: string;
  dossier_id: string;
  numero_seance: number;
  date_seance: string;        // ISO date
  heure_seance: string | null; // "HH:MM:SS"
  duree_minutes: number | null;
  prestataire_id: string;
  montant_paye: number;       // >= 0 (default 0)
  etat_seance: EtatSeance;    // "programmee" | "realisee"
  note: string | null;
  created_at: string;
}

/** Dossier médecin — champs sensibles chiffrés */
export interface DossierMedecin {
  id: string;
  patient_id: string;
  motif_ct: Ciphertext;
  date_ouverture: string | null; // ISO date
  date_fermeture: string | null; // ISO date
  created_by: string | null;
  updated_by: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
}

/** Consultations (rendez-vous médecin) */
export interface Consultation {
  id: string;
  dossier_medecin_id: string | null;
  patient_id: string;
  medecin_id: string;
  date_heure: string;           // ISO datetime
  duree_minutes: number;        // > 0, default 20
  statut: ConsultationStatut;
  commentaire: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
}

/** Documents (fichiers chiffrés côté client avant upload) */
export interface DocumentRow {
  id: string;
  dossier_id: string;                 // id d'un dossier soins ou medecin
  type_dossier: "soins" | "medecin";  // pour RLS
  nom: string;
  type_fichier: "photo" | "pdf" | "autre";
  storage_path: string;               // chemin Storage (prive)
  is_encrypted: boolean;              // default true
  enc_scheme: string | null;          // "client-side" etc.
  uploaded_by: string | null;
  client_id: string;
  created_at: string;
}

/** Tickets (support interne) */
export interface Ticket {
  id: string;
  client_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  sujet: string;
  commentaire: string | null;
  patient_id: string | null;
  dossier_soins_id: string | null;
  dossier_medecin_id: string | null;
  seance_id: string | null;
  statut: TicketStatus;
  admin_comment: string | null;
  treated_at: string | null;
  treated_by: string | null;
}

/* ======================================================================
 * Helpers légers (facultatifs, utiles pour le routeur / header)
 * ==================================================================== */

/** Récupérer le profil users_base du user courant. */
export async function getCurrentProfile(): Promise<UserBase | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("users_base")
    .select("id, nom, prenom, type_utilisateur, type_client, client_id, created_at, updated_at")
    .eq("id", uid)
    .single();
  if (error) return null;
  return data as UserBase;
}

/** Récupérer le client courant (du profil). */
export async function getCurrentClient(): Promise<Client | null> {
  const profile = await getCurrentProfile();
  if (!profile?.client_id) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", profile.client_id)
    .single();
  if (error) return null;
  return data as Client;
}

/* ======================================================================
 * Notes importantes pour le front:
 * - Les colonnes *_ct sont des bytea : utiliser Uint8Array avec supabase-js.
 * - Chiffrement/Dechiffrement 100% côté client (WebCrypto).
 * - Si tu veux rechercher par nom/téléphone, prévoir des "blind indexes".
 * ==================================================================== */
