import { useQuery } from '@tanstack/react-query';
import { getMetrics } from '@/lib/api';
import { fmtMoney, signClass } from '@/lib/contracts';

type Card = {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
  hint?: string;
};

export function MetricsCards() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <div className="text-red-400 text-sm">Failed to load metrics: {(error as Error).message}</div>;
  }
  if (!data) return null;

  const cards: Card[] = [
    {
      label: 'Realized PnL',
      value: fmtMoney(data.realizedPnL),
      tone: parseFloat(data.realizedPnL) > 0 ? 'positive' : parseFloat(data.realizedPnL) < 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Unrealized PnL',
      value: fmtMoney(data.unrealizedPnL),
      tone:
        parseFloat(data.unrealizedPnL) > 0
          ? 'positive'
          : parseFloat(data.unrealizedPnL) < 0
            ? 'negative'
            : 'neutral',
    },
    {
      label: 'Projected max profit',
      value: fmtMoney(data.projectedMaxProfit),
      tone: 'positive',
      hint: 'If all positions expire at max gain.',
    },
    {
      label: 'Max risk',
      value: fmtMoney(data.maxRisk),
      tone: 'negative',
      hint: 'If all positions hit stop-loss.',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-panel rounded-lg p-4 border border-slate-700">
          <div className="text-xs uppercase tracking-wide text-slate-400">{c.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${signClass(c.value, true)}`}>{c.value}</div>
          {c.hint && <div className="text-xs text-slate-500 mt-1">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}