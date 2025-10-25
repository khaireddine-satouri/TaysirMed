// src/repositories/dossiersSoinsRepo.ts
import { supabase } from "../lib/supabase";
import { aesGcmDecrypt, aesGcmEncrypt, bytesToHex, normalizeBytea } from "../crypto/crypto";
import { getMasterKey } from "../crypto/keystore";
import {
  cache_clearDossiers,
  cache_getDossiers,
  cache_getDossiersByPatient,
  cache_setDossier,
  cache_removeDossier,
  type DossierSoinsClear,
} from "../store/secureCache";

// Déchiffrer une ligne dossiers_soins
async function decryptDossierRow(row: any): Promise<DossierSoinsClear> {
  const key = getMasterKey();
  const motif = await aesGcmDecrypt(normalizeBytea(row.motif_ct), key);
  const commentaire = row.commentaire_ct ? await aesGcmDecrypt(normalizeBytea(row.commentaire_ct), key) : null;

  return {
    id: row.id,
    patient_id: row.patient_id,
    motif,
    commentaire,
    nombre_seances: row.nombre_seances,
    pec_cnam: row.pec_cnam,
    prix_par_seance: row.prix_par_seance,
    date_debut: row.date_debut,
    date_fin: row.date_fin,
    etat: row.etat,
    etat_pec: row.etat_pec,
    est_actif: row.est_actif,
    est_paye: row.est_paye,
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    client_id: row.client_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function encryptDossierFields(input: { motif: string; commentaire?: string | null }) {
  const key = getMasterKey();
  const motif_ct = await aesGcmEncrypt(input.motif.trim(), key);
  const commentaire_ct = input.commentaire ? await aesGcmEncrypt(input.commentaire.trim(), key) : null;

  return {
    motif_ct: `\\x${bytesToHex(motif_ct)}`,
    commentaire_ct: commentaire_ct ? `\\x${bytesToHex(commentaire_ct)}` : null,
  };
}

// Pull → cache
export async function dossiers_fetchAllToCache(): Promise<void> {
  cache_clearDossiers();
  const { data, error } = await supabase
    .from("dossiers_soins")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const row of data || []) {
    const clear = await decryptDossierRow(row);
    cache_setDossier(clear);
  }
}

// Listes depuis le cache
export function dossiers_listFromCache(): DossierSoinsClear[] {
  return cache_getDossiers();
}
export function dossiers_listByPatientFromCache(patientId: string): DossierSoinsClear[] {
  return cache_getDossiersByPatient(patientId);
}

// Création
export async function dossiers_create(input: {
  patient_id: string;
  motif: string;
  commentaire?: string | null;
  nombre_seances?: number;
  pec_cnam?: boolean;
  prix_par_seance?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  etat?: "a_venir" | "en_cours" | "termine";
  etat_pec?: "en_cours" | "depose";
  created_by?: string | null;
  client_id: string;
}): Promise<DossierSoinsClear> {
  const enc = await encryptDossierFields({ motif: input.motif, commentaire: input.commentaire ?? null });

  const { data, error } = await supabase
    .from("dossiers_soins")
    .insert({
      ...enc,
      patient_id: input.patient_id,
      nombre_seances: input.nombre_seances ?? 0,
      pec_cnam: input.pec_cnam ?? false,
      prix_par_seance: input.prix_par_seance ?? null,
      date_debut: input.date_debut ?? null,
      date_fin: input.date_fin ?? null,
      etat: input.etat ?? "a_venir",
      etat_pec: input.etat_pec ?? "en_cours",
      created_by: input.created_by ?? null,
      client_id: input.client_id,
    })
    .select("*")
    .single();

  if (error) throw error;

  const clear = await decryptDossierRow(data);
  cache_setDossier(clear);
  return clear;
}

// Update
export async function dossiers_update(id: string, patch: {
  motif?: string;
  commentaire?: string | null;
  // autres champs non chiffrés :
  nombre_seances?: number;
  pec_cnam?: boolean;
  prix_par_seance?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  etat?: "a_venir" | "en_cours" | "termine";
  etat_pec?: "en_cours" | "depose";
  est_paye?: boolean | null;
}): Promise<DossierSoinsClear> {
  const updatePayload: Record<string, any> = {};
  if (patch.motif != null) {
    updatePayload.motif_ct = `\\x${bytesToHex(await aesGcmEncrypt(patch.motif, getMasterKey()))}`;
  }
  if (patch.commentaire !== undefined) {
    updatePayload.commentaire_ct =
      patch.commentaire == null ? null : `\\x${bytesToHex(await aesGcmEncrypt(patch.commentaire, getMasterKey()))}`;
  }

  // champs en clair
  for (const k of [
    "nombre_seances",
    "pec_cnam",
    "prix_par_seance",
    "date_debut",
    "date_fin",
    "etat",
    "etat_pec",
    "est_paye",
  ] as const) {
    if ((patch as any)[k] !== undefined) (updatePayload as any)[k] = (patch as any)[k];
  }

  const { data, error } = await supabase.from("dossiers_soins").update(updatePayload).eq("id", id).select("*").single();
  if (error) throw error;

  const clear = await decryptDossierRow(data);
  cache_setDossier(clear);
  return clear;
}

// Delete
export async function dossiers_delete(id: string): Promise<void> {
  const { error } = await supabase.from("dossiers_soins").delete().eq("id", id);
  if (error) throw error;
  cache_removeDossier(id);
}
