import { useQuery } from '@tanstack/react-query';
import { getHealthTyped } from '@/lib/api';
import type { HealthSignal } from '@/lib/contracts';

// US5 — Automation health indicator. Three pills (broker, quote, telegram)
// colored by freshness thresholds (FR-011).

function ageMs(s: HealthSignal): number | null {
  if (s.ageMs !== undefined && s.ageMs !== null) return s.ageMs;
  const t = new Date(s.ts).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

function statusClass(s: HealthSignal | null): { pill: string; dot: string; label: string } {
  if (!s) return { pill: 'bg-slate-700/40 text-slate-400', dot: 'bg-slate-500', label: 'n/a' };
  if (s.status === 'UNREACHABLE') return { pill: 'bg-red-500/20 text-red-300', dot: 'bg-red-400', label: 'UNREACHABLE' };
  if (s.status === 'DEGRADED') return { pill: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400', label: 'DEGRADED' };
  // OK — color by age: green < threshold, amber < stale, red > stale
  const age = ageMs(s) ?? 0;
  if (age > 30 * 60 * 1000) return { pill: 'bg-red-500/20 text-red-300', dot: 'bg-red-400', label: 'STALE' };
  return { pill: 'bg-green-500/20 text-green-300', dot: 'bg-green-400', label: 'OK' };
}

function Pill({ label, signal }: { label: string; signal: HealthSignal | null }) {
  const klass = statusClass(signal);
  const age = signal ? ageMs(signal) : null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${klass.pill}`} title={signal?.ts ?? 'no signal recorded'}>
      <span className={`w-1.5 h-1.5 rounded-full ${klass.dot}`} />
      {label}: {klass.label}
      {age !== null ? ` · ${Math.floor(age / 60_000)}m` : ''}
    </span>
  );
}

export function HealthWidget() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: getHealthTyped,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const h = data?.health ?? null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill label="BROKER" signal={h?.broker ?? null} />
      <Pill label="QUOTE" signal={h?.quote ?? null} />
      <Pill label="TELEGRAM" signal={h?.telegram ?? null} />
      {h && h.recentRateLimitHits > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-red-500/20 text-red-300" title="429 responses in the last 60 min">
          RATE-LIMITED · {h.recentRateLimitHits} hits
        </span>
      )}
    </div>
  );
}