import { TickerList } from '@/components/TickerList';
import { TickerForm } from '@/components/TickerForm';

export function TickersPage() {
  return (
    <div className="space-y-6">
      <TickerForm />
      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-3">Configured tickers</h2>
        <TickerList />
      </section>
    </div>
  );
}