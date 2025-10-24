// src/App.tsx
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';

function TestBench() {
  const { user, userBase, loading, signOut } = useAuth();
  const [pingResult, setPingResult] = useState<any>(null);
  const [pingError, setPingError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const hardReset = () => {
    try {
      // Purge local storage pour virer un refresh_token invalide
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch {}
    // Déconnexion “globale” et reload
    supabase.auth.signOut({ scope: 'global' }).finally(() => {
      if (typeof window !== 'undefined') window.location.replace('/login');
    });
  };

  const pingUsersBase = async () => {
    setBusy(true);
    setPingResult(null);
    setPingError(null);
    try {
      const { data, error } = await supabase
        .from('users_base')
        .select('id, client_id, type_utilisateur, nom, prenom')
        .limit(5);
      if (error) throw error;
      setPingResult(data);
    } catch (e: any) {
      setPingError(e);
    } finally {
      setBusy(false);
    }
  };

  const getClientType = async () => {
    if (!userBase?.client_id) {
      setPingResult({ info: 'Aucun client_id dans users_base' });
      return;
    }
    setBusy(true);
    setPingResult(null);
    setPingError(null);
    try {
      const { data, error, status } = await supabase
        .from('clients')
        .select('id, nom, statut, type_client')
        .eq('id', userBase.client_id)
        .maybeSingle();

      if (error) throw Object.assign(error, { status });
      setPingResult({ status, data });
    } catch (e: any) {
      setPingError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white border rounded-xl shadow-sm p-4">
          <h1 className="text-xl font-bold mb-1">Playground de test</h1>
          <p className="text-gray-600 mb-4">
            Cette page ne charge aucun layout ni logique métier. Elle affiche uniquement l’état
            d’authentification et permet quelques tests simples.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <a
              href="/login"
              className="px-4 py-2 rounded-lg border text-center hover:bg-gray-50"
            >
              Aller au Login
            </a>
            <a
              href="/signup"
              className="px-4 py-2 rounded-lg border text-center hover:bg-gray-50"
            >
              Aller au Signup
            </a>
          </div>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-4">
          <h2 className="font-semibold mb-2">État Auth</h2>
          {loading ? (
            <div className="text-gray-500">Chargement de la session…</div>
          ) : user ? (
            <div className="space-y-1">
              <div><span className="font-mono text-sm">user.id</span>: {user.id}</div>
              <div><span className="font-mono text-sm">user.email</span>: {user.email}</div>
            </div>
          ) : (
            <div className="text-gray-500">Pas connecté</div>
          )}
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-4">
          <h2 className="font-semibold mb-2">users_base</h2>
          {userBase ? (
            <div className="space-y-1">
              <div><span className="font-mono text-sm">id</span>: {userBase.id}</div>
              <div><span className="font-mono text-sm">type_utilisateur</span>: {userBase.type_utilisateur}</div>
              <div><span className="font-mono text-sm">client_id</span>: {userBase.client_id ?? 'null'}</div>
              <div><span className="font-mono text-sm">nom/prenom</span>: {userBase.prenom} {userBase.nom}</div>
            </div>
          ) : (
            <div className="text-gray-500">Aucune ligne users_base chargée pour l’utilisateur courant.</div>
          )}
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold mb-2">Tests rapides</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              onClick={pingUsersBase}
              disabled={busy}
            >
              SELECT * FROM users_base LIMIT 5
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              onClick={getClientType}
              disabled={busy}
            >
              Lire clients (du current client_id)
            </button>
            <button
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              onClick={() => signOut().finally(() => window.location.replace('/login'))}
            >
              Se déconnecter (signOut)
            </button>
            <button
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              onClick={hardReset}
            >
              Hard reset tokens + reload
            </button>
          </div>

          <div className="mt-3">
            {busy && <div className="text-sm text-gray-500">Requête en cours…</div>}
            {pingResult && (
              <pre className="text-xs bg-gray-50 border rounded p-2 overflow-auto">
                {JSON.stringify(pingResult, null, 2)}
              </pre>
            )}
            {pingError && (
              <pre className="text-xs bg-red-50 border border-red-200 text-red-700 rounded p-2 overflow-auto">
                {JSON.stringify(
                  { message: pingError.message, status: pingError.status ?? null, details: pingError },
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TestBench />
    </AuthProvider>
  );
}
