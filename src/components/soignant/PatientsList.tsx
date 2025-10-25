import { useState, useEffect } from "react";
import { supabase, PatientCipher as Patient } from "../../lib/supabase";
import { Search, Plus, User, Phone, X, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import * as EncryptionService from "../../crypto/EncryptionService";
import * as KeyService from "../../crypto/KeyService";

/** Conversion générique pour bytea retourné par Supabase:
 * - PostgREST renvoie souvent des strings hexadécimales: "\\x...."
 * - On accepte aussi un Uint8Array direct
 */
function toBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    const len = hex.length / 2;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }
  // Postgrest peut aussi renvoyer Array<number>
  if (Array.isArray(value)) return new Uint8Array(value);
  return new Uint8Array();
}

type PatientView = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  telephone_2: string | null;
  created_at: string;
};

interface PatientsListProps {
  onSelectPatient: (patient: any /* adapt if needed for next screen */) => void;
}

export default function PatientsList({ onSelectPatient }: PatientsListProps) {
  const { user, userBase } = useAuth();
  const isAdmin = userBase?.type_utilisateur === "admin";

  const [patients, setPatients] = useState<PatientView[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientView[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // État suppression
  const [patientToDelete, setPatientToDelete] = useState<PatientView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>("");

  useEffect(() => {
    loadPatients();
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

      const phoneDigits = (s: string) => (s || "").replace(/\D/g, "");
      const phoneMatch =
        digits.length >= 3 &&
        (phoneDigits(p.telephone).includes(digits) ||
          (p.telephone_2 ? phoneDigits(p.telephone_2).includes(digits) : false));

      return allTokensInFull || simpleMatch || phoneMatch;
    });

    setFilteredPatients(next);
  }, [searchTerm, patients]);

  const loadPatients = async () => {
    try {
      setLoading(true);

      // 1) On récupère la DEK (doit déjà être déverrouillée)
      const dek = await KeyService.getDEK();
      if (!dek) {
        console.error("DEK indisponible — session de chiffrement verrouillée.");
        setPatients([]);
        setFilteredPatients([]);
        setLoading(false);
        return;
      }

      // 2) Charger les patients (champs *_ct)
      const { data, error } = await supabase
        .from("patients")
        .select("id, nom_ct, prenom_ct, telephone_ct, telephone2_ct, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // 3) Déchiffrer
      const views: PatientView[] = await Promise.all(
        (data || []).map(async (row: any) => {
          const nom = await EncryptionService.decryptBytesToUtf8(toBytes(row.nom_ct), dek);
          const prenom = await EncryptionService.decryptBytesToUtf8(toBytes(row.prenom_ct), dek);
          const telephone = await EncryptionService.decryptBytesToUtf8(toBytes(row.telephone_ct), dek);
          const telephone_2 = row.telephone2_ct
            ? await EncryptionService.decryptBytesToUtf8(toBytes(row.telephone2_ct), dek)
            : null;

          return {
            id: row.id,
            nom,
            prenom,
            telephone,
            telephone_2,
            created_at: row.created_at,
          } as PatientView;
        })
      );

      setPatients(views);
      setFilteredPatients(views);
    } catch (err) {
      console.error("Erreur chargement patients:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPatient = () => setShowAddModal(true);

  // Suppression via Edge Function
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
                className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                title="Voir le patient"
              >
                <PatientAvatar nom={patient.nom} prenom={patient.prenom} />
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

      {/* Modal d’ajout */}
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

/* ======= Avatar simple (initiales) ======= */
function PatientAvatar({ nom, prenom }: { nom: string; prenom: string }) {
  const initials =
    (prenom?.[0] || "").toUpperCase() + (nom?.[0] || "").toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold">
      {initials || <User className="w-6 h-6 text-teal-600" />}
    </div>
  );
}

/* ======= Modal Ajout Patient ======= */

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
  const [telephone2, setTelephone2] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const dek = await KeyService.getCurrentDEK();
      if (!dek) {
        throw new Error("Veuillez déverrouiller la session de chiffrement (WebAuthn) pour créer un patient.");
      }

      const nom_ct = await EncryptionService.encryptUtf8ToBytes(nom.trim(), dek);
      const prenom_ct = await EncryptionService.encryptUtf8ToBytes(prenom.trim(), dek);
      const telephone_ct = await EncryptionService.encryptUtf8ToBytes(telephone.trim(), dek);
      const telephone2_ct = telephone2.trim()
        ? await EncryptionService.encryptUtf8ToBytes(telephone.trim() ? telephone2.trim() : "", dek)
        : null;

      const { error: insertError } = await supabase.from("patients").insert({
        nom_ct,
        prenom_ct,
        telephone_ct,
        telephone2_ct,
        created_by: userId || null,
        client_id: clientId,
      });

      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
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
              disabled={loading}
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

/* ======= Modal Confirmation Suppression ======= */

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
              </span>. Cette action entraînera la suppression définitive de tous les dossiers
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
