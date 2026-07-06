import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPerformance } from '@/lib/api';
import { fmtMoney, type PerformanceWindow } from '@/lib/contracts';

// US9 — System performance statistics.

const WINDOWS: PerformanceWindow[] = ['7d', '30d', '90d', 'all'];

function Metric({ label, value, accent }: { label: string; value: string | null | number; accent?: 'good' | 'bad' }) {
  const cls = accent === 'good' ? 'text-profit' : accent === 'bad' ? 'text-loss' : 'text-slate-100';
  return (
    <div className="p-3 rounded-lg bg-panel border border-slate-700">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-mono ${cls}`}>{value === null || value === undefined ? '—' : value}</div>
    </div>
  );
}

export function PerformancePanel() {
  const [window, setWindow] = useState<PerformanceWindow>('30d');
  const { data, isLoading } = useQuery({
    queryKey: ['performance', window],
    queryFn: () => getPerformance(window),
    refetchInterval: 60_000,
  });
  if (isLoading) return <div className="text-sm text-slate-400">Loading performance…</div>;
  if (!data) return null;
  if (data.insufficientSamples) {
    return (
      <div className="p-6 rounded-lg bg-panel border border-slate-700 text-sm text-slate-400 text-center">
        Muestras insuficientes — vuelve con ≥5 trades cerrados (actual: {data.closedCount}).
      </div>
    );
  }
  const pf = parseFloat(data.profitFactor ?? '0');
  const pfAccent = pf >= 1.5 ? 'good' : pf < 1 ? 'bad' : undefined;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wide">System performance</h3>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={`px-2 py-1 rounded text-[11px] font-medium ${
                window === w ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Profit factor" value={data.profitFactor} accent={pfAccent} />
        <Metric label="Win rate" value={data.winRate ? `${data.winRate}%` : null} />
        <Metric label="Avg winner" value={fmtMoney(data.averageWinner)} />
        <Metric label="Avg loser" value={fmtMoney(data.averageLoser)} />
        <Metric label="Max consec losses" value={data.maxConsecutiveLosses} />
        <Metric label="Max drawdown" value={fmtMoney(data.maxDrawdown)} accent={data.maxDrawdown ? 'bad' : undefined} />
        <Metric label="Expectancy" value={fmtMoney(data.expectancy)} />
        <Metric label="Closed" value={data.closedCount} />
      </div>
      <p className="text-[10px] text-slate-500">Computed at {new Date(data.computedAt).toISOString()}</p>
    </div>
  );
}