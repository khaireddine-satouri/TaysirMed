// src/components/soignant/PatientsList.tsx
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Search, Plus, Phone, X, Trash2, User, Lock } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useKeys } from "../../contexts/KeyManager";
import { anyToU8, aesGcmEncrypt, unpackIvCt, packIvCt } from "../../utils/zkcrypto";

/** ===================== Types ===================== **/

type PatientRow = {
  id: string;
  client_id: string;
  created_at: string;
  created_by: string | null;
  nom_ct: any;        // bytea -> "\\x..." ou Uint8Array
  prenom_ct: any;     // bytea
  telephone_ct: any;  // bytea
  telephone2_ct: any; // bytea | null
};

export type PatientView = {
  id: string;
  client_id: string;
  created_at: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone_2: string | null;
};

interface PatientsListProps {
  onSelectPatient: (patient: PatientView) => void;
}

/** ===================== Composant principal ===================== **/

export default function PatientsList({ onSelectPatient }: PatientsListProps) {
  const { user, userBase } = useAuth();
  const isAdmin = userBase?.type_utilisateur === "admin";
  const { dek, zkReady, deriveAndLoad } = useKeys();

  const [patients, setPatients] = useState<PatientView[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientView[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Suppression
  const [patientToDelete, setPatientToDelete] = useState<PatientView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>("");

  // Déverrouillage
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlockErr, setUnlockErr] = useState("");

  useEffect(() => {
    if (!zkReady) {
      setLoading(false); // important: on arrête le spinner et on montre le panneau de déverrouillage
      return;
    }
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zkReady]);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredPatients(patients);
      return;
    }

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const term = normalize(searchTerm);
    const tokens = term.split(/\s+/).filter(Boolean);
    const digits = searchTerm.replace(/\D/g, "");

    const next = patients.filter((p) => {
      const first = normalize(p.prenom);
      const last = normalize(p.nom);

      const fullFL = `${first} ${last}`;
      const fullLF = `${last} ${first}`;

      const allTokensInFull =
        tokens.every((t) => fullFL.includes(t) || fullLF.includes(t));
      const simpleMatch = first.includes(term) || last.includes(term);

      const phoneMatch =
        digits.length >= 3 &&
        ((p.telephone || "").replace(/\D/g, "").includes(digits) ||
          (p.telephone_2
            ? p.telephone_2.replace(/\D/g, "").includes(digits)
            : false));

      return allTokensInFull || simpleMatch || phoneMatch;
    });

    setFilteredPatients(next);
  }, [searchTerm, patients]);

  const loadPatients = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("patients")
        .select(
          "id, client_id, created_at, created_by, nom_ct, prenom_ct, telephone_ct, telephone2_ct"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as PatientRow[];
      const views: PatientView[] = [];

      for (const row of rows) {
        try {
          const view = await decryptPatientRow(row, dek!);
          views.push(view);
        } catch (e) {
          // Données legacy (non chiffrées) ou corrompues -> on les masque/ignore proprement
          console.warn("Ligne patient non déchiffrable, ignorée:", row.id, e);
        }
      }

      setPatients(views);
      setFilteredPatients(views);
    } catch (err) {
      console.error("Erreur chargement patients:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockErr("");
    try {
      if (!user?.id) throw new Error("Session invalide.");
      await deriveAndLoad(unlockPwd, user.id);
      setUnlockPwd("");
      // `zkReady` passera à true -> useEffect relancera loadPatients
    } catch (err: any) {
      console.error(err);
      setUnlockErr("Mot de passe incorrect ou matériel de clé manquant.");
    }
  };

  const handleAddPatient = () => setShowAddModal(true);

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        setDeleteError("Session expirée. Veuillez vous reconnecter.");
        setDeleting(false);
        return;
      }

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-patient`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ patientId: patientToDelete.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression");

      setPatientToDelete(null);
      await loadPatients();
    } catch (err: any) {
      console.error("Erreur suppression patient:", err);
      setDeleteError(err.message || "La suppression a échoué.");
    } finally {
      setDeleting(false);
    }
  };

  // --- ÉTATS D’INTERFACE ---

  // 1) Pas déverrouillé -> panneau Unlock
  if (!zkReady) {
    return (
      <div className="max-w-lg mx-auto mt-10 bg-white rounded-xl shadow p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Déverrouiller les données patients</h2>
            <p className="text-sm text-gray-600">
              Entrez votre mot de passe pour déchiffrer vos données locales.
            </p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="mt-4 space-y-3">
          <input
            type="password"
            value={unlockPwd}
            onChange={(e) => setUnlockPwd(e.target.value)}
            placeholder="Mot de passe"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            required
          />
          {unlockErr && (
            <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
              {unlockErr}
            </div>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
          >
            Déverrouiller
          </button>
        </form>
      </div>
    );
  }

  // 2) Déverrouillé mais en cours de chargement
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // 3) Déverrouillé + chargement terminé -> UI normale
  return (
    <div className="space-y-4">
      {/* Barre de recherche + bouton ajouter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher un patient (nom, prénom, téléphone)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleAddPatient}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition"
        >
          <Plus className="w-5 h-5" />
          Ajouter patient
        </button>
      </div>

      {/* Grille de cartes patients */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPatients.map((patient) => (
          <div
            key={patient.id}
            className="bg-white p-4 rounded-lg shadow hover:shadow-md transition"
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onSelectPatient(patient)}
                className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0"
                title="Voir le patient"
              >
                <User className="w-6 h-6 text-teal-600" />
              </button>

              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onSelectPatient(patient)}
                  className="text-left w-full"
                  title="Voir le patient"
                >
                  <h3 className="font-semibold text-gray-900 truncate">
                    {patient.prenom} {patient.nom}
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                    <Phone className="w-4 h-4" />
                    <span className="truncate">{patient.telephone}</span>
                  </div>
                  {patient.telephone_2 && (
                    <div className="flex items-center gap-1 text-sm text-gray-600 mt-0.5">
                      <Phone className="w-4 h-4 opacity-70" />
                      <span className="truncate">{patient.telephone_2}</span>
                    </div>
                  )}
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setPatientToDelete(patient)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Supprimer le patient"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredPatients.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? "Aucun patient trouvé" : "Aucun patient enregistré"}
        </div>
      )}

      {/* Modal d’ajout (sans photo en V2) */}
      {showAddModal && (
        <AddPatientModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadPatients();
          }}
          userId={user?.id || ""}
          clientId={userBase?.client_id || ""}
        />
      )}

      {/* Modal de confirmation suppression */}
      {patientToDelete && (
        <ConfirmDeletePatientModal
          patient={patientToDelete}
          loading={deleting}
          error={deleteError}
          onCancel={() => setPatientToDelete(null)}
          onConfirm={handleDeletePatient}
        />
      )}
    </div>
  );
}

/** ===================== Déchiffrement ===================== **/

async function decryptPatientRow(row: PatientRow, dek: CryptoKey): Promise<PatientView> {
  const enc = new TextEncoder();
  const td = new TextDecoder();
  const base = `client:${row.client_id}|table:patients|id:${row.id}|v:1|col:`;

  const nomBuf = anyToU8(row.nom_ct);
  const { iv: ivNom, ct: ctNom } = unpackIvCt(nomBuf);
  const nomPlain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivNom, additionalData: enc.encode(base + "nom") }, dek, ctNom);
  const nom = td.decode(nomPlain);

  const preBuf = anyToU8(row.prenom_ct);
  const { iv: ivPre, ct: ctPre } = unpackIvCt(preBuf);
  const prePlain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivPre, additionalData: enc.encode(base + "prenom") }, dek, ctPre);
  const prenom = td.decode(prePlain);

  const telBuf = anyToU8(row.telephone_ct);
  const { iv: ivTel, ct: ctTel } = unpackIvCt(telBuf);
  const telPlain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivTel, additionalData: enc.encode(base + "telephone") }, dek, ctTel);
  const telephone = td.decode(telPlain);

  let telephone_2: string | null = null;
  if (row.telephone2_ct) {
    const tel2Buf = anyToU8(row.telephone2_ct);
    const { iv: ivTel2, ct: ctTel2 } = unpackIvCt(tel2Buf);
    const tel2Plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivTel2, additionalData: enc.encode(base + "telephone2") }, dek, ctTel2);
    telephone_2 = td.decode(tel2Plain);
  }

  return {
    id: row.id,
    client_id: row.client_id,
    created_at: row.created_at,
    nom,
    prenom,
    telephone,
    telephone_2,
  };
}

/** ===================== Modal Ajout (V2 sans photo) ===================== **/

interface AddPatientModalProps {
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  clientId: string;
}

function AddPatientModal({ onClose, onSuccess, userId, clientId }: AddPatientModalProps) {
  const { dek } = useKeys();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [telephone2, setTelephone2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!dek) throw new Error("CLÉ NON DISPONIBLE (DEK)");

      const enc = new TextEncoder();
      const newId = crypto.randomUUID();
      const aad = (col: string) => enc.encode(`client:${clientId}|table:patients|id:${newId}|v:1|col:${col}`);

      const nomEnc = await aesGcmEncrypt(dek, enc.encode(nom.trim()), aad("nom"));
      const prenomEnc = await aesGcmEncrypt(dek, enc.encode(prenom.trim()), aad("prenom"));
      const telEnc = await aesGcmEncrypt(dek, enc.encode(telephone.trim()), aad("telephone"));
      const tel2Enc = telephone2.trim() ? await aesGcmEncrypt(dek, enc.encode(telephone2.trim()), aad("telephone2")) : null;

      const nom_ct = packIvCt(nomEnc.iv, nomEnc.cipher);
      const prenom_ct = packIvCt(prenomEnc.iv, prenomEnc.cipher);
      const telephone_ct = packIvCt(telEnc.iv, telEnc.cipher);
      const telephone2_ct = tel2Enc ? packIvCt(tel2Enc.iv, tel2Enc.cipher) : null;

      const { error: insertError } = await supabase.from("patients").insert([
        {
          id: newId,
          nom_ct,
          prenom_ct,
          telephone_ct,
          telephone2_ct,
          created_by: userId || null,
          client_id: clientId,
        },
      ]);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors de la création du patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Nouveau patient</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prénom *</label>
            <input
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone *</label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone 2 (optionnel)</label>
            <input
              type="tel"
              value={telephone2}
              onChange={(e) => setTelephone2(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!dek || loading}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Création..." : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** ===================== Modal Confirmation Suppression ===================== **/

function ConfirmDeletePatientModal({
  patient,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  patient: PatientView;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-50 text-red-600">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Confirmer la suppression</h3>
            <p className="text-sm text-gray-700 mt-1">
              Vous êtes sur le point de supprimer le patient{" "}
              <span className="font-semibold">
                {patient.prenom} {patient.nom}
              </span>
              . Cette action entraînera la suppression définitive de tous les dossiers
              de soins associés, y compris leurs séances et documents.
              <br />
              <span className="font-medium">Cette opération est irréversible.</span>
            </p>
            {error && (
              <div className="mt-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
          >
            {loading ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
