// src/store/secureCache.ts
/* Cache mémoire des données déchiffrées (en clair) pour l'UI.
 * Rien n'est persisté au repos : un refresh efface le cache.
 */

export type PatientClear = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  created_by: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
};

export type DossierSoinsClear = {
  id: string;
  patient_id: string;
  motif: string;
  commentaire?: string | null;
  nombre_seances: number;
  pec_cnam: boolean;
  prix_par_seance: number | null;
  date_debut: string | null;
  date_fin: string | null;
  etat: "a_venir" | "en_cours" | "termine";
  etat_pec: "en_cours" | "depose";
  est_actif: boolean;
  est_paye: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
};

const patients = new Map<string, PatientClear>();
const dossiers = new Map<string, DossierSoinsClear>();

// Patients
export function cache_setPatient(p: PatientClear) {
  patients.set(p.id, p);
}
export function cache_removePatient(id: string) {
  patients.delete(id);
}
export function cache_getPatients(): PatientClear[] {
  return Array.from(patients.values());
}
export function cache_getPatient(id: string): PatientClear | undefined {
  return patients.get(id);
}
export function cache_clearPatients() {
  patients.clear();
}

// Dossiers
export function cache_setDossier(d: DossierSoinsClear) {
  dossiers.set(d.id, d);
}
export function cache_removeDossier(id: string) {
  dossiers.delete(id);
}
export function cache_getDossiers(): DossierSoinsClear[] {
  return Array.from(dossiers.values());
}
export function cache_getDossiersByPatient(patientId: string): DossierSoinsClear[] {
  return Array.from(dossiers.values()).filter((d) => d.patient_id === patientId);
}
export function cache_clearDossiers() {
  dossiers.clear();
}

// Tout
export function cache_clearAll() {
  cache_clearPatients();
  cache_clearDossiers();
}
