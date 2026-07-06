import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

// US8 — Real-vs-theoretical theta decay overlay. Observed mid-price dots
// against a smooth theoretical curve; shaded band when divergence > 10% of credit.

type ThetaResponse = {
  observed: { ts: string; mid: string; dte: number }[];
  theoretical: { dte: number; mid: string }[];
  credit: string;
  divergencePct: string | null;
};

export function ThetaDecayChart({ positionId }: { positionId: string }) {
  const [data, setData] = useState<ThetaResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/positions/${positionId}/theta`);
        if (!res.ok) return;
        const json = (await res.json()) as ThetaResponse;
        if (!cancelled) setData(json);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  if (!data) {
    return (
      <div className="p-4 rounded-lg bg-panel border border-slate-700 text-sm text-slate-400">
        Theta decay no disponible (faltan observaciones de mid-price).
      </div>
    );
  }

  const theoretical = data.theoretical.map((t) => ({ dte: t.dte, theoretical: parseFloat(t.mid) }));
  const observed = data.observed.map((o) => ({ dte: o.dte, observed: parseFloat(o.mid) }));
  const credit = parseFloat(data.credit);
  const bandThreshold = credit * 0.10;

  return (
    <div className="p-4 rounded-lg bg-panel border border-slate-700">
      <h3 className="text-sm font-medium text-slate-200 mb-2">Theta: real vs teórico (flat underlying)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={theoretical} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="dte" stroke="#64748b" fontSize={10} label={{ value: 'DTE', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }} reversed />
          <YAxis stroke="#64748b" fontSize={10} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
          {bandThreshold > 0 && (
            <ReferenceArea y1={credit - bandThreshold} y2={credit + bandThreshold} fill="#475569" fillOpacity={0.15} />
          )}
          <Line type="monotone" dataKey="theoretical" stroke="#a78bfa" dot={false} strokeWidth={2} />
          <Scatter data={observed} dataKey="observed" fill="#f59e0b" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-slate-500 mt-2">
        La curva teórica asume un subyacente plano y un IV constante; las observaciones reales pueden diverger si el spot se mueve o el IV cambia.
      </p>
    </div>
  );
}