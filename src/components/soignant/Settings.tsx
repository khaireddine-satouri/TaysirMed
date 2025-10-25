// src/components/soignant/Settings.tsx
import { useState, useEffect, useMemo } from "react";
import { supabase, type UserBase } from "../../lib/supabase";
import {
  Save,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  Edit3,
  Trash2,
  Check,
  X,
  Mail
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

/* ================== Types & Defaults ================== */

type DashFilters = {
  etat: "all" | "a_venir" | "en_cours" | "termine";
  pec: "all" | "oui" | "non";
  etatPec: "all" | "en_cours" | "depose";
  paiement: "all" | "paye" | "debiteur";
  activite: "all" | "actif" | "inactif";
  dateDebut: string;
  dateFin: string;
  patientSearch: string;
  motifSearch: string;
};

const FALLBACK_DASH_FILTERS: DashFilters = {
  etat: "en_cours",
  pec: "all",
  etatPec: "all",
  paiement: "debiteur",
  activite: "all",
  dateDebut: "",
  dateFin: "",
  patientSearch: "",
  motifSearch: "",
};

type Member = Pick<
  UserBase,
  "id" | "nom" | "prenom" | "type_utilisateur" | "type_client" | "client_id" | "created_at"
>;

/* ================== Component ================== */

export default function Settings() {
  const { userBase } = useAuth();
  const clientId = userBase?.client_id;
  const isAdmin = userBase?.type_utilisateur === "admin";

  /* ---- App settings ---- */
  const [joursInactivite, setJoursInactivite] = useState("4");
  const [dashDefaultFilters, setDashDefaultFilters] = useState<DashFilters>(FALLBACK_DASH_FILTERS);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* ---- Invitation ---- */
  const [inviteNom, setInviteNom] = useState("");
  const [invitePrenom, setInvitePrenom] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"assistant" | "secretaire">("assistant");
  const [inviteMessage, setInviteMessage] = useState<JSX.Element | string>("");
  const [inviteLoading, setInviteLoading] = useState(false);

  /* ---- Members list / edit / delete ---- */
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");
  const [editPrenom, setEditPrenom] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const isEditing = (id: string) => editingId === id;

  // Delete modal
  const [userToDelete, setUserToDelete] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (clientId && isAdmin) {
      loadSettings();
      loadMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isAdmin]);

  /* ================== Loaders ================== */

  const loadSettings = async () => {
    try {
      // jours_inactivite
      const { data: inact, error: e1 } = await supabase
        .from("app_settings")
        .select("valeur")
        .eq("client_id", clientId)
        .eq("cle", "jours_inactivite")
        .maybeSingle();
      if (e1) throw e1;
      if (inact?.valeur) setJoursInactivite(inact.valeur);

      // dashboard_default_filters
      const { data: dash, error: e2 } = await supabase
        .from("app_settings")
        .select("valeur")
        .eq("client_id", clientId)
        .eq("cle", "dashboard_default_filters")
        .maybeSingle();
      if (e2) throw e2;
      if (dash?.valeur) {
        try {
          const parsed: DashFilters = JSON.parse(dash.valeur);
          setDashDefaultFilters({ ...FALLBACK_DASH_FILTERS, ...parsed });
        } catch {
          setDashDefaultFilters(FALLBACK_DASH_FILTERS);
        }
      }
    } catch (error) {
      console.error("Erreur chargement paramètres:", error);
    }
  };

  const loadMembers = async () => {
    if (!clientId) return;
    try {
      setMembersLoading(true);
      setMembersError("");
      const { data, error } = await supabase
        .from("users_base")
        .select("id, nom, prenom, type_utilisateur, type_client, client_id, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMembers((data || []) as Member[]);
    } catch (err: any) {
      console.error("Erreur chargement membres:", err);
      setMembersError(err.message || "Erreur lors du chargement des membres.");
    } finally {
      setMembersLoading(false);
    }
  };

  /* ================== Save Settings ================== */

  const saveAll = async () => {
    if (!clientId) return;
    setLoading(true);
    setMessage("");

    try {
      // 1) jours_inactivite
      const { error: e1 } = await supabase.from("app_settings").upsert(
        {
          client_id: clientId,
          cle: "jours_inactivite",
          valeur: joursInactivite,
        },
        { onConflict: ["client_id", "cle"] }
      );
      if (e1) throw e1;

      // 2) dashboard_default_filters
      const { error: e2 } = await supabase.from("app_settings").upsert(
        {
          client_id: clientId,
          cle: "dashboard_default_filters",
          valeur: JSON.stringify(dashDefaultFilters),
        },
        { onConflict: ["client_id", "cle"] }
      );
      if (e2) throw e2;

      setMessage("Paramètres enregistrés avec succès");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Erreur sauvegarde paramètres:", error);
      setMessage("Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  /* ================== Invite Member ================== */

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMessage("");
    if (!clientId) return;

    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail,
          nom: inviteNom,
          prenom: invitePrenom,
          role: inviteRole,
          client_id: clientId,
        },
      });

      if (error) throw error;

      if (data?.status === "already_exists") {
        setInviteMessage(`⚠️ L'adresse ${inviteEmail} correspond déjà à un compte existant.`);
      } else if (data?.status === "already_invited") {
        setInviteMessage(`⚠️ Une invitation est déjà en attente pour ${inviteEmail}.`);
      } else if (data?.status === "success" || data?.ok) {
        setInviteMessage(
          `✅ Une invitation a été envoyée à ${inviteEmail}. La personne concernée pourra créer son mot de passe et rejoindre votre équipe.`
        );
        setInviteNom("");
        setInvitePrenom("");
        setInviteEmail("");
        setInviteRole("assistant");
        // on recharge les membres (au cas où users_base a été upsert)
        loadMembers();
      } else {
        setInviteMessage(
          <>
            ❌ Erreur lors de l’envoi de l’invitation. Vérifiez si la personne concernée a déjà
            reçu une invitation et si besoin contactez le{" "}
            <a href="mailto:support@taysirmed.tn" className="text-teal-600 underline">
              support@taysirmed.tn
            </a>
            .
          </>
        );
      }
    } catch (err: any) {
      console.error("Erreur invitation:", err);
      setInviteMessage(
        <>
          ❌ Erreur lors de l’envoi de l’invitation. Vérifiez si la personne concernée a déjà
          reçu une invitation et si besoin contactez le{" "}
          <a href="mailto:support@taysirmed.tn" className="text-teal-600 underline">
            support@taysirmed.tn
          </a>
          .
        </>
      );
    } finally {
      setInviteLoading(false);
    }
  };

  /* ================== Edit Member ================== */

  const startEdit = (m: Member) => {
    setEditingId(m.id);
    setEditNom(m.nom || "");
    setEditPrenom(m.prenom || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNom("");
    setEditPrenom("");
    setEditSaving(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from("users_base")
        .update({ nom: editNom.trim(), prenom: editPrenom.trim() })
        .eq("id", editingId);
      if (error) throw error;
      cancelEdit();
      await loadMembers();
    } catch (err) {
      console.error("Erreur maj membre:", err);
      setEditSaving(false);
    }
  };

  /* ================== Delete Member (Edge Function) ================== */

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    setDeleteError("");

    try {
      // ne pas tenter de te supprimer toi-même (déjà protégé côté UI)
      if (userToDelete.id === userBase?.id) {
        setDeleteError("Vous ne pouvez pas supprimer votre propre compte.");
        setDeleting(false);
        return;
      }

      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        setDeleteError("Session expirée. Veuillez vous reconnecter.");
        setDeleting(false);
        return;
      }

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erreur lors de la suppression");

      setUserToDelete(null);
      await loadMembers();
    } catch (err: any) {
      console.error("Erreur suppression membre:", err);
      setDeleteError(err.message || "La suppression a échoué.");
    } finally {
      setDeleting(false);
    }
  };

  /* ================== Derived ================== */

  const disabled = useMemo(() => !isAdmin, [isAdmin]);

  /* ================== Render ================== */

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-6 h-6 text-teal-600" />
          <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
        </div>

        {!isAdmin && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 mb-6">
            Accès en lecture seule — seuls les administrateurs peuvent modifier ces paramètres.
          </div>
        )}

        {/* === Section Invitation === */}
        {isAdmin && (
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-600" />
              Ajouter un membre
            </h3>
            <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <input
                type="text"
                placeholder="Nom"
                value={inviteNom}
                onChange={(e) => setInviteNom(e.target.value)}
                required
                className="px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Prénom"
                value={invitePrenom}
                onChange={(e) => setInvitePrenom(e.target.value)}
                required
                className="px-4 py-2 border rounded-lg"
              />
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    placeholder="Adresse email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  />
                </div>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "assistant" | "secretaire")}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="assistant">Assistant</option>
                  <option value="secretaire">Secrétaire</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={inviteLoading}
                className="bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-lg md:col-span-2 disabled:opacity-50"
              >
                {inviteLoading ? "Envoi..." : "Envoyer l’invitation"}
              </button>
            </form>
            {inviteMessage && <div className="text-sm text-gray-700">{inviteMessage}</div>}
          </div>
        )}

        {/* === Section Membres === */}
        {isAdmin && (
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" />
              Membres de l’équipe
            </h3>

            {membersLoading ? (
              <div className="py-6 text-gray-500">Chargement…</div>
            ) : membersError ? (
              <div className="py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4">
                {membersError}
              </div>
            ) : members.length === 0 ? (
              <div className="py-6 text-gray-500">Aucun membre trouvé.</div>
            ) : (
              <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
                {members.map((m) => (
                  <li key={m.id} className="p-4 flex items-center justify-between">
                    {/* Infos / Edition inline */}
                    {!isEditing(m.id) ? (
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {m.prenom || "-"} {m.nom || "-"}
                        </div>
                        <div className="text-sm text-gray-500 capitalize">
                          {m.type_utilisateur} • {m.type_client}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1">
                        <input
                          type="text"
                          value={editPrenom}
                          onChange={(e) => setEditPrenom(e.target.value)}
                          className="px-3 py-2 border rounded-lg w-full sm:w-56"
                          placeholder="Prénom"
                        />
                        <input
                          type="text"
                          value={editNom}
                          onChange={(e) => setEditNom(e.target.value)}
                          className="px-3 py-2 border rounded-lg w-full sm:w-56"
                          placeholder="Nom"
                        />
                      </div>
                    )}

                    {/* Actions (cachées pour le user connecté) */}
                    <div className="flex items-center gap-2 ml-4">
                      {m.id !== userBase?.id && (
                        !isEditing(m.id) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                              title="Modifier nom/prénom"
                            >
                              <Edit3 className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setUserToDelete(m)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Supprimer le membre"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={editSaving}
                              className="p-2 text-teal-700 hover:bg-teal-50 rounded-lg transition disabled:opacity-50"
                              title="Enregistrer"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={editSaving}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                              title="Annuler"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* === Jours d'inactivité === */}
        <div className="space-y-2 mb-8">
          <label className="block text-sm font-medium text-gray-700">Jours d'inactivité</label>
          <p className="text-sm text-gray-600">
            Nombre de jours écoulés depuis la dernière séance avant qu’un dossier en cours soit
            considéré comme inactif.
          </p>
          <input
            type="number"
            min="1"
            value={joursInactivite}
            onChange={(e) => setJoursInactivite(e.target.value)}
            disabled={disabled}
            className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-50"
          />
        </div>

        {/* === Filtres par défaut === */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Filtres par défaut — Tableau de bord des dossiers de soins
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* État */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">État</label>
              <select
                value={dashDefaultFilters.etat}
                onChange={(e) =>
                  setDashDefaultFilters((s) => ({ ...s, etat: e.target.value as DashFilters["etat"] }))
                }
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tous</option>
                <option value="a_venir">À venir</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
              </select>
            </div>

            {/* PEC Assurance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PEC Assurance</label>
              <select
                value={dashDefaultFilters.pec}
                onChange={(e) =>
                  setDashDefaultFilters((s) => ({ ...s, pec: e.target.value as DashFilters["pec"] }))
                }
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tous</option>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </div>

            {/* État PEC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">État PEC</label>
              <select
                value={dashDefaultFilters.etatPec}
                onChange={(e) =>
                  setDashDefaultFilters((s) => ({
                    ...s,
                    etatPec: e.target.value as DashFilters["etatPec"],
                  }))
                }
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tous</option>
                <option value="en_cours">En cours</option>
                <option value="depose">Déposé</option>
              </select>
            </div>

            {/* Paiement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Paiement</label>
              <select
                value={dashDefaultFilters.paiement}
                onChange={(e) =>
                  setDashDefaultFilters((s) => ({
                    ...s,
                    paiement: e.target.value as DashFilters["paiement"],
                  }))
                }
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tous</option>
                <option value="paye">Payé</option>
                <option value="debiteur">Débiteur</option>
              </select>
            </div>

            {/* Activité */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Activité</label>
              <select
                value={dashDefaultFilters.activite}
                onChange={(e) =>
                  setDashDefaultFilters((s) => ({
                    ...s,
                    activite: e.target.value as DashFilters["activite"],
                  }))
                }
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Tous</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
            </div>

            {/* Date début */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date début</label>
              <input
                type="date"
                value={dashDefaultFilters.dateDebut}
                onChange={(e) => setDashDefaultFilters((s) => ({ ...s, dateDebut: e.target.value }))}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Date fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date fin</label>
              <input
                type="date"
                value={dashDefaultFilters.dateFin}
                onChange={(e) => setDashDefaultFilters((s) => ({ ...s, dateFin: e.target.value }))}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {message && (
            <div
              className={`px-4 py-3 rounded-lg ${
                message.includes("succès")
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <button
            onClick={saveAll}
            disabled={loading || disabled}
            className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Modal de confirmation suppression */}
      {userToDelete && (
        <ConfirmDeleteMemberModal
          member={userToDelete}
          loading={deleting}
          error={deleteError}
          onCancel={() => {
            setUserToDelete(null);
            setDeleteError("");
          }}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}

/* ================== Modal Confirmation Suppression ================== */

function ConfirmDeleteMemberModal({
  member,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  member: Member;
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
              Vous êtes sur le point de supprimer le membre{" "}
              <span className="font-semibold">
                {member.prenom} {member.nom}
              </span>
              . Cette action supprimera son accès à l’application.
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
