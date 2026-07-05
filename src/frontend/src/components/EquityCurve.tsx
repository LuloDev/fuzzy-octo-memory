import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getEquityCurve } from '@/lib/api';

export function EquityCurve() {
  const { data, isLoading } = useQuery({
    queryKey: ['equityCurve', 30],
    queryFn: () => getEquityCurve(30),
  });

  if (isLoading) {
    return <div className="bg-panel rounded-lg p-4 h-72 animate-pulse" />;
  }
  if (!data) return null;

  const points = data.series.map((p) => ({
    date: p.date,
    pnl: parseFloat(p.pnl),
  }));

  if (points.length === 0) {
    return (
      <div className="bg-panel rounded-lg p-4 border border-slate-700 text-slate-400 text-sm">
        No equity history yet. Daily PnL aggregates appear here after positions close.
      </div>
    );
  }

  return (
    <div className="bg-panel rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Daily PnL — last 30 days
        </h3>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
              formatter={(v: number) => [`$${v.toFixed(2)}`, 'PnL']}
            />
            <ReferenceLine y={0} stroke="#64748b" />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}