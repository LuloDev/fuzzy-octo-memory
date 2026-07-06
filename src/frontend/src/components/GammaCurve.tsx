import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

// US3 — Gamma exposure curve for a single open position. Fetches the
// server-computed curve and renders it with a "today" marker.

type GammaPoint = { dteDays: number; exposurePct: number };

export function GammaCurve({ positionId }: { positionId: string }) {
  const [data, setData] = useState<GammaPoint[]>([]);
  const [currentDte, setCurrentDte] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/positions/${positionId}/gamma`);
        if (!res.ok) return;
        const json = (await res.json()) as { curve: GammaPoint[]; currentDte: number; iv: number };
        if (!cancelled) {
          setData(json.curve);
          setCurrentDte(json.currentDte);
        }
      } catch {
        /* best-effort; render empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  if (data.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-panel border border-slate-700 text-sm text-slate-400">
        Gamma curve no disponible (IV o underlying price ausente).
      </div>
    );
  }
  return (
    <div className="p-4 rounded-lg bg-panel border border-slate-700">
      <h3 className="text-sm font-medium text-slate-200 mb-2">Gamma exposure (|net Γ|, normalized)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="dteDays" stroke="#64748b" fontSize={10} label={{ value: 'DTE', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }} />
          <YAxis stroke="#64748b" fontSize={10} unit="%" />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }}
            formatter={(v: number) => [`${v}%`, 'Exposure']}
            labelFormatter={(l) => `DTE ${l}`}
          />
          <Line type="monotone" dataKey="exposurePct" stroke="#38bdf8" dot={false} strokeWidth={2} />
          {currentDte !== null && <ReferenceLine x={currentDte} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'hoy', fill: '#f59e0b', fontSize: 10 }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}