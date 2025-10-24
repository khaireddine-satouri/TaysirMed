import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, RefreshCcw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Consultation = {
  id: string;
  client_id: string | null;
  patient_id: string;
  medecin_id: string;
  dossier_medecin_id: string | null;
  date_consultation: string; // 'YYYY-MM-DD'
  heure_consultation: string | null; // 'HH:MM:SS' | null
  created_at: string;
  updated_at: string;
  commentaire_enc: string | null; // bytea -> livré en base64 par supabase-js
};

type Props = {
  /** Ouvre un détail (à implémenter chez toi) */
  onOpenConsultation?: (consultationId: string) => void;
  /** Ouvre le patient (tu gèreras le déchiffrement/affichage) */
  onOpenPatient?: (patientId: string) => void;
  /** Rafraîchissement externe éventuel */
  refreshToken?: number;
};

export default function RendezVousList({ onOpenConsultation, onOpenPatient, refreshToken }: Props) {
  const [items, setItems] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    // format YYYY-MM-DD (locale-indépendant)
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Récupère uniquement à partir d’aujourd’hui
      const { data, error } = await supabase
        .from('consultations')
        .select('id, client_id, patient_id, medecin_id, dossier_medecin_id, date_consultation, heure_consultation, created_at, updated_at, commentaire_enc')
        .gte('date_consultation', today)
        .order('date_consultation', { ascending: true })
        .order('heure_consultation', { ascending: true })
        .limit(200);

      if (error) throw error;
      setItems((data ?? []) as Consultation[]);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, refreshToken]);

  const grouped = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of items) {
      if (!map.has(c.date_consultation)) map.set(c.date_consultation, []);
      map.get(c.date_consultation)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [items]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const formatTime = (t: string | null) => (t ? t.slice(0, 5) : '—');

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 text-teal-700 mb-4">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Prochains rendez-vous</h2>
        </div>
        <div className="flex items-center gap-3 text-gray-600">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600" />
          Chargement…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-red-100">
        <div className="flex items-center gap-2 text-red-700 mb-2">
          <AlertCircle className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Prochains rendez-vous</h2>
        </div>
        <p className="text-sm text-red-700">{err}</p>
        <button
          onClick={load}
          className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Réessayer
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 text-teal-700 mb-2">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Prochains rendez-vous</h2>
        </div>
        <p className="text-gray-600">Aucun rendez-vous à venir.</p>
        <button
          onClick={load}
          className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-teal-700">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Prochains rendez-vous</h2>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-sm"
          title="Actualiser"
        >
          <RefreshCcw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      <div className="space-y-6">
        {grouped.map(([date, rows]) => (
          <section key={date}>
            <h3 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
              {formatDate(date)}
            </h3>
            <ul className="divide-y divide-gray-100 border rounded-lg">
              {rows.map((c) => (
                <li key={c.id} className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-gray-900">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">{formatTime(c.heure_consultation)}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {/* Patient name chiffré → à remplacer par affichage déchiffré côté UI */}
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-50 border text-gray-700 mr-2">
                          Patient: {c.patient_id.slice(0, 8)}…
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-50 border text-gray-700">
                          Dossier: {c.dossier_medecin_id ? c.dossier_medecin_id.slice(0, 8) + '…' : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onOpenPatient && (
                        <button
                          onClick={() => onOpenPatient(c.patient_id)}
                          className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50"
                          title="Ouvrir le patient"
                        >
                          Patient
                        </button>
                      )}
                      {onOpenConsultation && (
                        <button
                          onClick={() => onOpenConsultation(c.id)}
                          className="px-3 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
                          title="Détails du rendez-vous"
                        >
                          Détails
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
