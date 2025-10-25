// src/components/SecureGate.tsx
import { useState } from "react";
import { deriveKeyFromPassphrase } from "../crypto/derive";
import { hasMasterKey, setMasterKey } from "../crypto/keystore";
import { patients_fetchAllToCache } from "../repositories/patientsRepo";
import { dossiers_fetchAllToCache } from "../repositories/dossiersSoinsRepo";

export default function SecureGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(hasMasterKey());
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const key = await deriveKeyFromPassphrase(pass);
      setMasterKey(key);

      // Pré-chargement des données sensibles en cache
      await patients_fetchAllToCache();
      await dossiers_fetchAllToCache();

      setReady(true);
    } catch (e: any) {
      setErr(e?.message || "Impossible de déverrouiller.");
    } finally {
      setLoading(false);
      setPass("");
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleUnlock}
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-gray-900">Déverrouiller les données</h1>
            <p className="text-sm text-gray-600">
              Entrez votre passphrase pour déchiffrer les informations sensibles.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Passphrase</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="••••••••"
              autoFocus
            />
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Déverrouillage…" : "Déverrouiller"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
