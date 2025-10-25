import { useEffect, useMemo, useState } from "react";
import { supabase, type PatientCipher } from "../../lib/supabase";
import { Search, Plus, User, Phone, X, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// Helpers crypto (prévu dans notre implémentation)
import * as CryptoBox from "../../crypto/CryptoBox";
import { KeyService } from "../../crypto/KeyService";

// ======================
// Types UI (déchiffrés)
// ======================
export type PatientPlain = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone2?: string | null;
  created_at: string;
};

interface PatientsListProps {
  onSelectPatient: (patient: PatientPlain) => void;
}

// Bytea -> Uint8Array (gère "\x..." hex et base64)
function toBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      const hex = value.slice(2);
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return out;
    }
    try {
      return CryptoBox.base64ToBytes(value);
    } catch {
      return new TextEncoder().encode(value);
    }
  }
  return new TextEncoder().encode(JSON.stringify(value));
}

export default function PatientsList({ onSelectPatient }: PatientsListProps) {
  const { user, userBase } = useAuth();
  const isAdmin = userBase?.type_utilisateur === "admin";

  const [patients, setPatients] = useState<PatientPlain[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientPlain[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Suppression
  const [patientToDelete, setPatientToDelete] = useState<PatientPlain | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>("");

  // Modal ajout
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadPatientsV2();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const allTokensInFull = tokens.every((t) => fullFL.includes(t) || fullLF.includes(t));
      const simpleMatch = first.includes(term) || last.includes(term);

      const phoneMatch =
        digits.length >= 3 &&
        ((p.telephone || "").replace(/\D/g, "").includes(digits) ||
          (p.telephone2 ? p.telephone2.replace(/\D/g, "").includes(digits) : false));

      return allTokensInFull || simpleMatch || phoneMatch;
    });

    setFilteredPatients(next);
  }, [searchTerm, patients]);

  async function loadPatientsV2() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("patients")
        .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const dek = await KeyService.getDEK();
      if (!dek) throw new Error("DEK indisponible (bootstrap non terminé).");

      const plain: PatientPlain[] = await Promise.all(
        (data || []).map(async (row: any) => {
          const nom = await CryptoBox.decryptBytesToUtf8(toBytes(row.nom_ct), dek);
          const prenom = await CryptoBox.decryptBytesToUtf8(toBytes(row.prenom_ct), dek);
          const telephone = await CryptoBox.decryptBytesToUtf8(toBytes(row.telephone_ct), dek);
          const telephone2 = row.telephone2_ct
            ? await CryptoBox.decryptBytesToUtf8(toBytes(row.telephone2_ct), dek)
            : null;

          return {
            id: row.id,
            nom,
            prenom,
            telephone,
            telephone2,
            created_at: row.created_at,
          };
        })
      );

      setPatients(plain);
      setFilteredPatients(plain);
    } catch (err) {
      console.error("Erreur chargement patients:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleAddPatient = () => setShowAddModal(true);

  // Suppression via Edge Function (inchangé)
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
      await loadPatientsV2();
    } catch (err: any) {
      console.error("Erreur suppression patient:", err);
      setDeleteError(err.message || "La suppression a échoué.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

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
          <div key={patient.id} className="bg-white p-4 rounded-lg shadow hover:shadow-md transition">
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
                  {patient.telephone2 && (
                    <div className="flex items-center gap-1 text-sm text-gray-600 mt-0.5">
                      <Phone className="w-4 h-4 opacity-70" />
                      <span className="truncate">{patient.telephone2}</span>
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

      {/* Modal d’ajout */}
      {showAddModal && (
        <AddPatientModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadPatientsV2();
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

/* ======= Modal Ajout Patient (V2) — pas de photo ======= */

interface AddPatientModalProps {
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  clientId: string;
}

function AddPatientModal({ onClose, onSuccess, userId, clientId }: AddPatientModalProps) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [telephone2, setTelephone2] = useState(""); // optionnel
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return nom.trim() && prenom.trim() && telephone.trim();
  }, [nom, prenom, telephone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      // 1) DEK en mémoire
      const dek = await KeyService.getDEK();
      if (!dek) throw new Error("DEK indisponible.");

      // 2) Chiffrer
      const nom_ct = await CryptoBox.encryptUtf8ToBytes(nom.trim(), dek);
      const prenom_ct = await CryptoBox.encryptUtf8ToBytes(prenom.trim(), dek);
      const telephone_ct = await CryptoBox.encryptUtf8ToBytes(telephone.trim(), dek);
      const telephone2_ct = telephone2.trim()
        ? await CryptoBox.encryptUtf8ToBytes(telephone2.trim(), dek)
        : null;

      // 3) Insérer
      const { error: insertError } = await supabase
        .from("patients")
        .insert({
          nom_ct,
          prenom_ct,
          telephone_ct,
          telephone2_ct,
          created_by: userId || null,
          client_id: clientId, // RLS: doit matcher current_client_id()
        } as Partial<PatientCipher>);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
      console.error("Erreur création patient:", err);
      setError(err.message || "Erreur lors de la création du patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Téléphone 2 (optionnel)
            </label>
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
              disabled={loading || !canSubmit}
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

/* ======= Modal Confirmation Suppression (V2) ======= */

function ConfirmDeletePatientModal({
  patient,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  patient: PatientPlain;
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
