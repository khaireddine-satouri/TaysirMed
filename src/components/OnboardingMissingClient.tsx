function NoTenantScreen({ onRefresh, onSignOut }: { onRefresh: () => void; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Espace non initialisé</h2>
        <p className="text-gray-600">
          Vous êtes connecté, mais aucun espace client n’est encore rattaché à votre compte.
          Si vous venez de créer le compte, patientez quelques secondes et réessayez.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            Réessayer
          </button>
          <button
            onClick={onSignOut}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
          >
            Se déconnecter
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Astuce : assurez-vous que la procédure de création de l’espace (client) et le rattachement
          administrateur ont bien été effectués côté base (RPC <code>bootstrap_tenant_admin</code>).
        </p>
      </div>
    </div>
  );
}
