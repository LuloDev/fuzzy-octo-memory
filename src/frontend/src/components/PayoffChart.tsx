import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getPayoff } from '@/lib/api';
import { fmtMoney } from '@/lib/contracts';

type Props = {
  positionId: string;
};

// Payoff diagram: PnL vs underlying price at expiry.
// Two reference lines mark the break-evens; the flat top between shortPut
// and shortCall is the profit tent (max gain).
export function PayoffChart({ positionId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['payoff', positionId],
    queryFn: () => getPayoff(positionId),
  });
  if (isLoading) {
    return <div className="h-64 bg-panel rounded-lg animate-pulse" />;
  }
  if (!data) return null;

  const points = data.curve.map((p) => ({
    price: parseFloat(p.price),
    pnl: parseFloat(p.pnl),
  }));

  return (
    <div className="bg-panel rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Payoff at expiry</h4>
        <div className="text-xs text-slate-400 space-x-3">
          <span>max profit: {fmtMoney(data.maxProfit)}</span>
          <span>max loss: {fmtMoney(data.maxLoss)}</span>
          <span>
            BE {fmtMoney(data.breakEvenLower)} ↔ {fmtMoney(data.breakEvenUpper)}
          </span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="price" stroke="#94a3b8" fontSize={11} domain={['dataMin', 'dataMax']} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
              formatter={(v: number) => [`$${v.toFixed(2)}`, 'PnL']}
              labelFormatter={(l: number) => `Price $${l.toFixed(2)}`}
            />
            <ReferenceLine y={0} stroke="#64748b" />
            <ReferenceLine
              x={parseFloat(data.breakEvenLower)}
              stroke="#fbbf24"
              strokeDasharray="2 2"
              label={{ value: 'BE low', fill: '#fbbf24', fontSize: 10, position: 'top' }}
            />
            <ReferenceLine
              x={parseFloat(data.breakEvenUpper)}
              stroke="#fbbf24"
              strokeDasharray="2 2"
              label={{ value: 'BE high', fill: '#fbbf24', fontSize: 10, position: 'top' }}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}