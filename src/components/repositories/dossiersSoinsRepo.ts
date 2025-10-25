// src/repositories/dossiersSoinsRepo.ts
import { supabase } from "../lib/supabase";
import { decryptText, encryptText } from "../crypto/crypto";
import { getMasterKey } from "../crypto/keystore";
import {
  cacheListDossiersSoins,
  cacheSetDossierSoins,
  cacheRemoveDossierSoins,
  type PlainDossierSoins,
} from "../store/secureCache";

/** Charge tous les dossiers_soins (colonnes *_ct), déchiffre et remplit le cache. */
export async function dossiers_fetchAllToCache(): Promise<PlainDossierSoins[]> {
  const { data, error } = await supabase
    .from("dossiers_soins")
    .select(
      [
        "id",
        "patient_id",
        "motif_ct",
        "commentaire_ct",
        "nombre_seances",
        "pec_cnam",
        "prix_par_seance",
        "date_debut",
        "date_fin",
        "etat",
        "etat_pec",
        "est_actif",
        "est_paye",
        "client_id",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  const key = getMasterKey();

  for (const row of data ?? []) {
    const motif = await decryptText(key, new Uint8Array(row.motif_ct as ArrayBufferLike));
    const commentaire = row.commentaire_ct
      ? await decryptText(key, new Uint8Array(row.commentaire_ct as ArrayBufferLike))
      : null;

    const d: PlainDossierSoins = {
      id: row.id,
      patient_id: row.patient_id,
      motif,
      commentaire,
      nombre_seances: row.nombre_seances,
      pec_cnam: row.pec_cnam,
      prix_par_seance: Number(row.prix_par_seance),
      date_debut: row.date_debut,
      date_fin: row.date_fin,
      etat: row.etat,
      etat_pec: row.etat_pec,
      est_actif: row.est_actif,
      est_paye: row.est_paye,
      client_id: row.client_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    cacheSetDossierSoins(d);
  }

  return cacheListDossiersSoins();
}

/** Insert dossier_soins (plaintext sensibles -> chiffre) */
export async function dossiers_create(input: {
  patient_id: string;
  motif: string;
  commentaire?: string | null;
  nombre_seances: number;
  pec_cnam: boolean;
  prix_par_seance: number;
  date_debut?: string | null;
  date_fin?: string | null;
  etat: "a_venir" | "en_cours" | "termine";
  etat_pec: "en_cours" | "depose";
  est_actif: boolean;
  est_paye?: boolean | null;
  created_by?: string | null;
  client_id: string;
}): Promise<string> {
  const key = getMasterKey();

  const motif_ct = await encryptText(key, input.motif);
  const commentaire_ct =
    input.commentaire && input.commentaire.trim().length > 0
      ? await encryptText(key, input.commentaire)
      : null;

  const { data, error } = await supabase
    .from("dossiers_soins")
    .insert({
      patient_id: input.patient_id,
      motif_ct,
      commentaire_ct,
      nombre_seances: input.nombre_seances,
      pec_cnam: input.pec_cnam,
      prix_par_seance: input.prix_par_seance,
      date_debut: input.date_debut ?? null,
      date_fin: input.date_fin ?? null,
      etat: input.etat,
      etat_pec: input.etat_pec,
      est_actif: input.est_actif,
      est_paye: input.est_paye ?? null,
      created_by: input.created_by ?? null,
      client_id: input.client_id,
    })
    .select("id, created_at, updated_at")
    .single();

  if (error) throw error;

  const id = data.id as string;

  cacheSetDossierSoins({
    id,
    patient_id: input.patient_id,
    motif: input.motif,
    commentaire: input.commentaire ?? null,
    nombre_seances: input.nombre_seances,
    pec_cnam: input.pec_cnam,
    prix_par_seance: input.prix_par_seance,
    date_debut: input.date_debut ?? null,
    date_fin: input.date_fin ?? null,
    etat: input.etat,
    etat_pec: input.etat_pec,
    est_actif: input.est_actif,
    est_paye: input.est_paye ?? null,
    client_id: input.client_id,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });

  return id;
}

/** Update partiel dossier_soins (plaintext -> chiffre champs sensibles) */
export async function dossiers_update(
  id: string,
  patch: Partial<
    Pick<
      PlainDossierSoins,
      | "motif"
      | "commentaire"
      | "nombre_seances"
      | "pec_cnam"
      | "prix_par_seance"
      | "date_debut"
      | "date_fin"
      | "etat"
      | "etat_pec"
      | "est_actif"
      | "est_paye"
    >
  >
): Promise<void> {
  const key = getMasterKey();
  const toUpdate: Record<string, any> = {};

  if (patch.motif !== undefined) toUpdate.motif_ct = await encryptText(key, patch.motif);
  if (patch.commentaire !== undefined)
    toUpdate.commentaire_ct =
      patch.commentaire && patch.commentaire.length > 0
        ? await encryptText(key, patch.commentaire)
        : null;

  if (patch.nombre_seances !== undefined) toUpdate.nombre_seances = patch.nombre_seances;
  if (patch.pec_cnam !== undefined) toUpdate.pec_cnam = patch.pec_cnam;
  if (patch.prix_par_seance !== undefined) toUpdate.prix_par_seance = patch.prix_par_seance;
  if (patch.date_debut !== undefined) toUpdate.date_debut = patch.date_debut;
  if (patch.date_fin !== undefined) toUpdate.date_fin = patch.date_fin;
  if (patch.etat !== undefined) toUpdate.etat = patch.etat;
  if (patch.etat_pec !== undefined) toUpdate.etat_pec = patch.etat_pec;
  if (patch.est_actif !== undefined) toUpdate.est_actif = patch.est_actif;
  if (patch.est_paye !== undefined) toUpdate.est_paye = patch.est_paye;

  const { data, error } = await supabase
    .from("dossiers_soins")
    .update(toUpdate)
    .eq("id", id)
    .select("updated_at")
    .single();

  if (error) throw error;

  // Patch cache
  const existing = cacheListDossiersSoins().find((d) => d.id === id);
  if (existing) {
    cacheSetDossierSoins({
      ...existing,
      ...patch,
      updated_at: data.updated_at,
    });
  }
}

/** Delete dossier -> DB + cache */
export async function dossiers_delete(id: string): Promise<void> {
  const { error } = await supabase.from("dossiers_soins").delete().eq("id", id);
  if (error) throw error;
  cacheRemoveDossierSoins(id);
}
