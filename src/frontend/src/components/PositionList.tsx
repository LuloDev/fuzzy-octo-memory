import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPositions } from '@/lib/api';
import { fmtMoney, signClass } from '@/lib/contracts';
import { PayoffChart } from './PayoffChart';
import type { Position } from '@/lib/contracts';

export function PositionList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['positions'],
    queryFn: listPositions,
  });
  const [selected, setSelected] = useState<Position | null>(null);

  if (isLoading) {
    return <div className="bg-panel rounded-lg p-4 h-32 animate-pulse" />;
  }
  if (error) {
    return <div className="text-red-400 text-sm">Failed to load positions: {(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="bg-panel rounded-lg p-6 border border-slate-700 text-slate-400 text-sm">
        No open positions. The monitoring loop will open one per enabled ticker each week.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm bg-panel rounded-lg border border-slate-700 overflow-hidden">
        <thead className="bg-slate-800 text-slate-300 text-xs uppercase">
          <tr>
            <th className="text-left p-3">Symbol</th>
            <th className="text-left p-3">Expiration</th>
            <th className="text-right p-3">Contracts</th>
            <th className="text-right p-3">Short put / Long put</th>
            <th className="text-right p-3">Short call / Long call</th>
            <th className="text-right p-3">Entry credit</th>
            <th className="text-right p-3">Current value</th>
            <th className="text-right p-3">Unrealized</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((p) => {
            const unrealized =
              p.currentValue !== null
                ? (parseFloat(p.entryCredit) - parseFloat(p.currentValue)) * p.contracts * 100
                : null;
            return (
              <tr
                key={p.id}
                className={`hover:bg-slate-800/50 cursor-pointer ${selected?.id === p.id ? 'bg-slate-800/60' : ''}`}
                onClick={() => setSelected(p)}
              >
                <td className="p-3 font-semibold">{p.symbol}</td>
                <td className="p-3 text-slate-300">{p.expiration.slice(0, 10)}</td>
                <td className="p-3 text-right">{p.contracts}</td>
                <td className="p-3 text-right font-mono">
                  {p.shortPutStrike} / {p.longPutStrike}
                </td>
                <td className="p-3 text-right font-mono">
                  {p.shortCallStrike} / {p.longCallStrike}
                </td>
                <td className="p-3 text-right">{fmtMoney(p.entryCredit)}</td>
                <td className="p-3 text-right">
                  {p.currentValue !== null ? fmtMoney(p.currentValue) : <span className="text-slate-500">—</span>}
                </td>
                <td className={`p-3 text-right ${unrealized === null ? '' : signClass(unrealized.toString())}`}>
                  {unrealized === null ? '—' : fmtMoney(unrealized.toString())}
                </td>
                <td className="p-3 text-right text-xs text-sky-300">payoff →</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              {selected.symbol} — payoff at expiry
            </h3>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-200">
              close
            </button>
          </div>
          <PayoffChart positionId={selected.id} />
        </div>
      )}
    </div>
  );
}