import { MetricsCards } from '@/components/MetricsCards';
import { EquityCurve } from '@/components/EquityCurve';
import { PositionList } from '@/components/PositionList';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-3">Live financial state</h2>
        <MetricsCards />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityCurve />
        <div className="bg-panel border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Open positions
          </h3>
          <PositionList />
        </div>
      </section>
    </div>
  );
}