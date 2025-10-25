// src/providers/PatientsProvider.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../crypto/CryptoContext";
import { AesKey, encryptAesGcm, decryptAesGcm, strToBytes, bytesToStr } from "../crypto/crypto";

// Modèle "clair" pour le front
export type PatientClear = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  created_at: string;
  client_id: string;
};

type PatientsCtx = {
  loading: boolean;
  items: PatientClear[];
  refresh: () => Promise<void>;
  addPatient: (p: Omit<PatientClear, "id" | "created_at">) => Promise<void>;
  updatePatient: (id: string, patch: Partial<Omit<PatientClear, "id" | "created_at" | "client_id">>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
};

const PatientsContext = createContext<PatientsCtx>({
  loading: true,
  items: [],
  refresh: async () => {},
  addPatient: async () => {},
  updatePatient: async () => {},
  deletePatient: async () => {},
});

export function PatientsProvider({ children }: { children: React.ReactNode }) {
  const { userBase } = useAuth();
  const { ready, key, ensureKey } = useCrypto();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PatientClear[]>([]);

  useEffect(() => {
    if (!userBase) return;
    (async () => {
      setLoading(true);
      await ensureKey();              // s’assure que la clé est dispo
      await loadAll();                // charge + déchiffre
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBase?.client_id]);

  async function loadAll() {
    if (!key) return;
    const { data, error } = await supabase
      .from("patients")
      .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, client_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const out: PatientClear[] = [];
    for (const r of data ?? []) {
      const nom = await decField(key, r.nom_ct);
      const prenom = await decField(key, r.prenom_ct);
      const tel = await decField(key, r.telephone_ct);
      const tel2 = r.telephone2_ct ? await decField(key, r.telephone2_ct) : null;
      out.push({
        id: r.id,
        nom,
        prenom,
        telephone: tel,
        telephone2: tel2,
        client_id: r.client_id,
        created_at: r.created_at,
      });
    }
    setItems(out);
  }

  async function refresh() {
    setLoading(true);
    await loadAll();
    setLoading(false);
  }

  async function addPatient(p: Omit<PatientClear, "id" | "created_at">) {
    if (!key) throw new Error("Crypto indisponible");
    const row = {
      nom_ct: await encField(key, p.nom),
      prenom_ct: await encField(key, p.prenom),
      telephone_ct: await encField(key, p.telephone),
      telephone2_ct: p.telephone2 ? await encField(key, p.telephone2) : null,
      created_by: null,                 // tu peux mettre user.id si tu veux
      client_id: p.client_id,
    };
    const { data, error } = await supabase
      .from("patients")
      .insert(row)
      .select("id, created_at")
      .single();
    if (error) throw error;

    // Patch local
    setItems((cur) => [
      {
        id: data.id,
        created_at: data.created_at,
        client_id: p.client_id,
        nom: p.nom,
        prenom: p.prenom,
        telephone: p.telephone,
        telephone2: p.telephone2 ?? null,
      },
      ...cur,
    ]);
  }

  async function updatePatient(id: string, patch: Partial<Omit<PatientClear, "id" | "created_at" | "client_id">>) {
    if (!key) throw new Error("Crypto indisponible");
    const toUpdate: Record<string, any> = {};
    if (patch.nom !== undefined) toUpdate.nom_ct = await encField(key, patch.nom);
    if (patch.prenom !== undefined) toUpdate.prenom_ct = await encField(key, patch.prenom);
    if (patch.telephone !== undefined) toUpdate.telephone_ct = await encField(key, patch.telephone);
    if (patch.telephone2 !== undefined) {
      toUpdate.telephone2_ct = patch.telephone2 ? await encField(key, patch.telephone2) : null;
    }

    if (Object.keys(toUpdate).length === 0) return;

    const { error } = await supabase.from("patients").update(toUpdate).eq("id", id);
    if (error) throw error;

    // Patch local
    setItems((cur) =>
      cur.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  async function deletePatient(id: string) {
    // si tu as une edge function plus complète, appelle-la ici.
    const { error } = await supabase.from("patients").delete().eq("id", id);
    if (error) throw error;
    setItems((cur) => cur.filter((x) => x.id !== id));
  }

  const value = useMemo(
    () => ({ loading, items, refresh, addPatient, updatePatient, deletePatient }),
    [loading, items],
  );

  return <PatientsContext.Provider value={value}>{children}</PatientsContext.Provider>;
}

export const usePatients = () => useContext(PatientsContext);

// ====== petits helpers enc/dec pour bytea (supabase-js accepte Uint8Array) ======
async function encField(key: AesKey, s: string): Promise<Uint8Array> {
  return encryptAesGcm(key, strToBytes(s));
}
async function decField(key: AesKey, buf: any): Promise<string> {
  // supabase renvoie un ArrayBuffer/Uint8Array pour bytea.
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const pt = await decryptAesGcm(key, u8);
  return bytesToStr(pt);
}
