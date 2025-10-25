// src/repositories/patientsRepo.ts
import { supabase } from "../lib/supabase";
import { decryptText, encryptText } from "../crypto/crypto";
import { getMasterKey } from "../crypto/keystore";
import {
  cacheListPatients,
  cacheSetPatient,
  cacheRemovePatient,
  type PlainPatient,
} from "../store/secureCache";

/** Charge tous les patients (colonnes *_ct), déchiffre et remplit le cache. */
export async function patients_fetchAllToCache(): Promise<PlainPatient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select(
      [
        "id",
        "nom_ct",
        "prenom_ct",
        "telephone_ct",
        "telephone2_ct",
        "client_id",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  const key = getMasterKey();

  for (const row of data ?? []) {
    const p: PlainPatient = {
      id: row.id,
      nom: await decryptText(key, new Uint8Array(row.nom_ct as ArrayBufferLike)),
      prenom: await decryptText(key, new Uint8Array(row.prenom_ct as ArrayBufferLike)),
      telephone: await decryptText(key, new Uint8Array(row.telephone_ct as ArrayBufferLike)),
      telephone2: row.telephone2_ct
        ? await decryptText(key, new Uint8Array(row.telephone2_ct as ArrayBufferLike))
        : null,
      client_id: row.client_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    cacheSetPatient(p);
  }

  return cacheListPatients();
}

/** Insert patient (plaintext) -> chiffre -> insert -> maj cache */
export async function patients_create(input: {
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  created_by?: string | null;
  client_id: string;
}): Promise<string> {
  const key = getMasterKey();

  const nom_ct = await encryptText(key, input.nom.trim());
  const prenom_ct = await encryptText(key, input.prenom.trim());
  const telephone_ct = await encryptText(key, input.telephone.trim());
  const telephone2_ct = input.telephone2 ? await encryptText(key, input.telephone2.trim()) : null;

  const { data, error } = await supabase
    .from("patients")
    .insert({
      nom_ct,
      prenom_ct,
      telephone_ct,
      telephone2_ct,
      created_by: input.created_by ?? null,
      client_id: input.client_id,
    })
    .select("id, created_at, updated_at")
    .single();

  if (error) throw error;
  const id = data.id as string;

  // MàJ cache (plaintext)
  cacheSetPatient({
    id,
    nom: input.nom.trim(),
    prenom: input.prenom.trim(),
    telephone: input.telephone.trim(),
    telephone2: input.telephone2?.trim() ?? null,
    client_id: input.client_id,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });

  return id;
}

/** Update partiel (plaintext) -> re-chiffre uniquement les champs fournis -> update -> cache */
export async function patients_update(
  id: string,
  patch: Partial<Pick<PlainPatient, "nom" | "prenom" | "telephone" | "telephone2">>
): Promise<void> {
  const key = getMasterKey();
  const toUpdate: Record<string, any> = {};

  if (patch.nom !== undefined) toUpdate.nom_ct = await encryptText(key, patch.nom);
  if (patch.prenom !== undefined) toUpdate.prenom_ct = await encryptText(key, patch.prenom);
  if (patch.telephone !== undefined)
    toUpdate.telephone_ct = await encryptText(key, patch.telephone);
  if (patch.telephone2 !== undefined)
    toUpdate.telephone2_ct = patch.telephone2
      ? await encryptText(key, patch.telephone2)
      : null;

  const { data, error } = await supabase
    .from("patients")
    .update(toUpdate)
    .eq("id", id)
    .select("updated_at")
    .single();

  if (error) throw error;

  // Patch cache
  const existing = cacheListPatients().find((p) => p.id === id);
  if (existing) {
    const next: PlainPatient = {
      ...existing,
      ...patch,
      updated_at: data.updated_at,
    };
    cacheSetPatient(next);
  }
}

/** Delete -> DB + cache */
export async function patients_delete(id: string): Promise<void> {
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw error;
  cacheRemovePatient(id);
}
