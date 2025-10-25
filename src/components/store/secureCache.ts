// src/store/secureCache.ts
export type PlainPatient = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
};

export type PlainDossierSoins = {
  id: string;
  patient_id: string;
  motif: string;
  commentaire?: string | null;
  nombre_seances: number;
  pec_cnam: boolean;
  prix_par_seance: number;
  date_debut: string | null;
  date_fin: string | null;
  etat: "a_venir" | "en_cours" | "termine";
  etat_pec: "en_cours" | "depose";
  est_actif: boolean;
  est_paye: boolean | null;
  client_id: string;
  created_at: string;
  updated_at: string;
};

const patients = new Map<string, PlainPatient>();
const dossiersSoins = new Map<string, PlainDossierSoins>();

// Patients
export function cacheSetPatient(p: PlainPatient) {
  patients.set(p.id, p);
}
export function cacheGetPatient(id: string): PlainPatient | undefined {
  return patients.get(id);
}
export function cacheRemovePatient(id: string) {
  patients.delete(id);
}
export function cacheListPatients(): PlainPatient[] {
  return Array.from(patients.values());
}

// Dossiers soins
export function cacheSetDossierSoins(d: PlainDossierSoins) {
  dossiersSoins.set(d.id, d);
}
export function cacheGetDossierSoins(id: string): PlainDossierSoins | undefined {
  return dossiersSoins.get(id);
}
export function cacheRemoveDossierSoins(id: string) {
  dossiersSoins.delete(id);
}
export function cacheListDossiersSoins(): PlainDossierSoins[] {
  return Array.from(dossiersSoins.values());
}

// Utilitaires
export function clearAllCaches() {
  patients.clear();
  dossiersSoins.clear();
}
