import { useQuery } from '@tanstack/react-query';
import { listPositionsWithProximity } from '@/lib/api';
import { fmtMoney, type PositionWithProximity } from '@/lib/contracts';

// US1 — Risk Radar. Each open position is a row with two horizontal bars
// (put-side and call-side) color-coded by SAFE / WARNING / BREACH.

const STATE_STYLE: Record<'SAFE' | 'WARNING' | 'BREACH', { bar: string; pill: string; label: string }> = {
  SAFE: { bar: 'bg-green-500', pill: 'bg-green-500/20 text-green-300', label: 'SAFE' },
  WARNING: { bar: 'bg-amber-500', pill: 'bg-amber-500/20 text-amber-300', label: '⚠ WARNING' },
  BREACH: { bar: 'bg-red-500', pill: 'bg-red-500/20 text-red-300', label: '✗ BREACH (IN-THE-MONEY)' },
};

function Segment({ pct, usd, state }: { pct: string; usd: string; state: 'SAFE' | 'WARNING' | 'BREACH' }) {
  // Map distance to a bar width: smaller distance → larger bar.
  const distance = parseFloat(pct);
  // Saturate the bar at distance=0% (BREACH) and at distance=10% (very safe).
  const width = state === 'BREACH' ? 100 : Math.max(5, Math.min(100, (1 - distance / 10) * 100));
  return (
    <div className="flex-1">
      <div className="h-2 rounded bg-slate-700 overflow-hidden">
        <div className={`h-full ${STATE_STYLE[state].bar} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATE_STYLE[state].pill}`}>{STATE_STYLE[state].label}</span>
        <span className="text-xs text-slate-400">
          distance {pct}% ({usd >= '0' ? '+' : ''}{fmtMoney(usd)})
        </span>
      </div>
    </div>
  );
}

function PositionRow({ p }: { p: PositionWithProximity }) {
  if (!p.proximity) {
    return (
      <div className="p-4 rounded-lg bg-panel border border-slate-700 text-sm text-slate-400">
        <div className="font-medium text-slate-200">{p.symbol} — short p {p.shortPutStrike} / c {p.shortCallStrike}</div>
        <div className="text-xs">underlying price unavailable; thermometer disabled.</div>
      </div>
    );
  }
  return (
    <div className="p-4 rounded-lg bg-panel border border-slate-700">
      <div className="flex items-baseline gap-3 mb-3">
        <div className="text-lg font-semibold text-slate-100">{p.symbol}</div>
        <div className="text-xs text-slate-400">
          Short Put {p.shortPutStrike} · Short Call {p.shortCallStrike}
        </div>
        <div className="ml-auto text-xs text-slate-400">
          spot: {fmtMoney(p.currentUnderlyingPrice)}
        </div>
      </div>
      <div className="flex gap-4">
        <Segment pct={p.proximity.putDistancePct} usd={p.proximity.putDistanceUsd} state={p.proximity.putSide} />
        <Segment pct={p.proximity.callDistancePct} usd={p.proximity.callDistanceUsd} state={p.proximity.callSide} />
      </div>
    </div>
  );
}

export function ProximityRadar() {
  const { data, isLoading } = useQuery({ queryKey: ['positions-proximity'], queryFn: listPositionsWithProximity, refetchInterval: 30_000, staleTime: 15_000 });
  if (isLoading) return <div className="text-sm text-slate-400">Loading positions…</div>;
  if (!data || data.length === 0) {
    return (
      <div className="p-6 rounded-lg bg-panel border border-slate-700 text-sm text-slate-400 text-center">
        Sin posiciones abiertas — el radar se activa automáticamente al abrirse una posición.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wide">Risk radar</h3>
      {data.map((p) => (
        <PositionRow key={p.id} p={p} />
      ))}
    </div>
  );
}