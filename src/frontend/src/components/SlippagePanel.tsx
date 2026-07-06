import { useQuery } from '@tanstack/react-query';
import { getSlippage } from '@/lib/api';
import { fmtMoney } from '@/lib/contracts';

// US7 — Slippage tracker per combo.

function Histogram({ h }: { h: { under5c: number; fiveToFifteen: number; over15c: number; notFilled: number } }) {
  const max = Math.max(1, h.under5c, h.fiveToFifteen, h.over15c, h.notFilled);
  const buckets = [
    { label: '< 5¢', val: h.under5c, color: 'bg-green-500' },
    { label: '5–15¢', val: h.fiveToFifteen, color: 'bg-amber-500' },
    { label: '> 15¢', val: h.over15c, color: 'bg-red-500' },
    { label: 'NOT FILLED', val: h.notFilled, color: 'bg-slate-500' },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {buckets.map((b) => (
        <div key={b.label}>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{b.label}</div>
          <div className="h-2 rounded bg-slate-700 overflow-hidden mt-1">
            <div className={`h-full ${b.color}`} style={{ width: `${(b.val / max) * 100}%` }} />
          </div>
          <div className="text-[10px] text-slate-500 mt-1">{b.val}</div>
        </div>
      ))}
    </div>
  );
}

export function SlippagePanel() {
  const { data, isLoading } = useQuery({ queryKey: ['slippage'], queryFn: () => getSlippage(30), refetchInterval: 60_000 });
  if (isLoading) return <div className="text-sm text-slate-400">Loading slippage…</div>;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wide">Slippage (last 30 days)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-panel border border-slate-700">
          <div className="text-[10px] uppercase text-slate-400">Median / share</div>
          <div className="text-lg font-mono text-slate-100">{fmtMoney(data.summary.medianPerShare)}</div>
        </div>
        <div className="p-3 rounded-lg bg-panel border border-slate-700">
          <div className="text-[10px] uppercase text-slate-400">P90 / share</div>
          <div className="text-lg font-mono text-slate-100">{fmtMoney(data.summary.p90PerShare)}</div>
        </div>
        <div className="p-3 rounded-lg bg-panel border border-slate-700">
          <div className="text-[10px] uppercase text-slate-400">Median / combo</div>
          <div className="text-lg font-mono text-slate-100">{fmtMoney(data.summary.medianPerCombo)}</div>
        </div>
        <div className="p-3 rounded-lg bg-panel border border-slate-700">
          <div className="text-[10px] uppercase text-slate-400">P90 / combo</div>
          <div className="text-lg font-mono text-slate-100">{fmtMoney(data.summary.p90PerCombo)}</div>
        </div>
      </div>
      <Histogram h={data.summary.histogram} />
      <p className="text-[10px] text-slate-500">{data.closedCount} combos analizados</p>
    </div>
  );
}