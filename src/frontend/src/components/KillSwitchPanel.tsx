import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getKillState, postKill } from '@/lib/api';
import type { KillFeature } from '@/lib/contracts';

// US6 — Graduated kill switches. Two independent toggles that pause entry
// and maneuver dispatch respectively; they persist across container restarts.

const FEATURES: { feature: KillFeature; label: string; description: string }[] = [
  { feature: 'new-entries', label: 'New entries', description: 'pausa la apertura de nuevas posiciones' },
  { feature: 'maneuvers', label: 'Maneuvers', description: 'pausa TP/SL/roll (sigue evaluando, no ejecuta)' },
];

function FeatureToggle({ feature, label, description }: { feature: KillFeature; label: string; description: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['killState'],
    queryFn: getKillState,
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const row = feature === 'new-entries' ? data?.newEntries : data?.maneuvers;
  const paused = row?.paused ?? false;

  const mutation = useMutation({
    mutationFn: (action: 'pause' | 'resume') => postKill(feature, action, action === 'pause' ? 'manual' : 'resumed'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['killState'] }),
  });

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-panel border border-slate-700">
      <div>
        <div className="text-sm font-medium text-slate-100">{label}</div>
        <div className="text-[11px] text-slate-400">{description}</div>
        <div className="text-[10px] text-slate-500 mt-1">
          {paused ? `paused since ${row?.since ?? '—'}` : 'live'}
          {row?.reason ? ` · ${row.reason}` : ''}
        </div>
      </div>
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(paused ? 'resume' : 'pause')}
        className={`px-3 py-1.5 rounded-md text-xs font-medium ${
          paused
            ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
        } disabled:opacity-50`}
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>
    </div>
  );
}

export function KillSwitchPanel() {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wide">Kill switches</h3>
      {FEATURES.map((f) => (
        <FeatureToggle key={f.feature} {...f} />
      ))}
      <p className="text-[10px] text-slate-500">
        Los kill switches persisten entre reinicios. El hard panic (bottom-right) sigue disponible y bypasses este panel.
      </p>
    </div>
  );
}