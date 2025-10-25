// src/repositories/patientsRepo.ts
import { supabase } from "../lib/supabase";
import { aesGcmDecrypt, aesGcmEncrypt, bytesToHex, normalizeBytea } from "../crypto/crypto";
import { getMasterKey } from "../crypto/keystore";
import {
  cache_clearPatients,
  cache_getPatients,
  cache_setPatient,
  cache_removePatient,
  type PatientClear,
} from "../store/secureCache";

/** Déchiffre un enregistrement "patients" (V2) en PatientClear */
async function decryptPatientRow(row: any): Promise<PatientClear> {
  const key = getMasterKey();

  const nom = await aesGcmDecrypt(normalizeBytea(row.nom_ct), key);
  const prenom = await aesGcmDecrypt(normalizeBytea(row.prenom_ct), key);
  const tel = await aesGcmDecrypt(normalizeBytea(row.telephone_ct), key);
  const tel2 = row.telephone2_ct ? await aesGcmDecrypt(normalizeBytea(row.telephone2_ct), key) : null;

  return {
    id: row.id,
    nom,
    prenom,
    telephone: tel,
    telephone2: tel2,
    created_by: row.created_by ?? null,
    client_id: row.client_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Chiffre les champs sensibles pour un insert/update */
async function encryptPatientFields(input: {
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
}) {
  const key = getMasterKey();

  const nom_ct = await aesGcmEncrypt(input.nom.trim(), key);
  const prenom_ct = await aesGcmEncrypt(input.prenom.trim(), key);
  const telephone_ct = await aesGcmEncrypt(input.telephone.trim(), key);
  const telephone2_ct = input.telephone2 ? await aesGcmEncrypt(input.telephone2.trim(), key) : null;

  // on renvoie au format bytea texte "\\x<hex>" pour Postgres
  return {
    nom_ct: `\\x${bytesToHex(nom_ct)}`,
    prenom_ct: `\\x${bytesToHex(prenom_ct)}`,
    telephone_ct: `\\x${bytesToHex(telephone_ct)}`,
    telephone2_ct: telephone2_ct ? `\\x${bytesToHex(telephone2_ct)}` : null,
  };
}

/** Pull complet des patients → déchiffrer → remplir le cache */
export async function patients_fetchAllToCache(): Promise<void> {
  cache_clearPatients();
  const { data, error } = await supabase
    .from("patients")
    .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, created_by, client_id, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const row of data || []) {
    const clear = await decryptPatientRow(row);
    cache_setPatient(clear);
  }
}

/** Liste depuis le cache (en clair) */
export function patients_listFromCache(): PatientClear[] {
  return cache_getPatients();
}

/** Création d'un patient (chiffre puis insert) → met à jour le cache */
export async function patients_create(input: {
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  created_by?: string | null;
  client_id: string;
}): Promise<PatientClear> {
  const enc = await encryptPatientFields(input);

  const { data, error } = await supabase
    .from("patients")
    .insert({
      ...enc,
      created_by: input.created_by ?? null,
      client_id: input.client_id,
    })
    .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, created_by, client_id, created_at, updated_at")
    .single();

  if (error) throw error;

  const clear = await decryptPatientRow(data);
  cache_setPatient(clear);
  return clear;
}

/** Mise à jour d'un patient → update + patch cache */
export async function patients_update(id: string, patch: {
  nom?: string;
  prenom?: string;
  telephone?: string;
  telephone2?: string | null;
}): Promise<PatientClear> {
  // Ne rechiffre que les champs modifiés
  const updatePayload: Record<string, any> = {};
  if (patch.nom != null) updatePayload.nom_ct = `\\x${bytesToHex(await aesGcmEncrypt(patch.nom, getMasterKey()))}`;
  if (patch.prenom != null) updatePayload.prenom_ct = `\\x${bytesToHex(await aesGcmEncrypt(patch.prenom, getMasterKey()))}`;
  if (patch.telephone != null) updatePayload.telephone_ct = `\\x${bytesToHex(await aesGcmEncrypt(patch.telephone, getMasterKey()))}`;
  if (patch.telephone2 !== undefined) {
    updatePayload.telephone2_ct = patch.telephone2 == null
      ? null
      : `\\x${bytesToHex(await aesGcmEncrypt(patch.telephone2, getMasterKey()))}`;
  }

  const { data, error } = await supabase
    .from("patients")
    .update(updatePayload)
    .eq("id", id)
    .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, created_by, client_id, created_at, updated_at")
    .single();

  if (error) throw error;

  const clear = await decryptPatientRow(data);
  cache_setPatient(clear);
  return clear;
}

/** Suppression d'un patient → supprime du cache */
export async function patients_delete(id: string): Promise<void> {
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw error;
  cache_removePatient(id);
}
