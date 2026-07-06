import { SlippagePanel } from '@/components/SlippagePanel';
import { PerformancePanel } from '@/components/PerformancePanel';

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-sm uppercase tracking-wide text-slate-400">Analytics</h2>
      <PerformancePanel />
      <SlippagePanel />
    </div>
  );
}