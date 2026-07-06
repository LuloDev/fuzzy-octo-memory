import { PositionList } from '@/components/PositionList';
import { ProximityRadar } from '@/components/ProximityRadar';

export function PositionsPage() {
  return (
    <div className="space-y-6">
      <ProximityRadar />
      <div className="space-y-4">
        <h2 className="text-sm uppercase tracking-wide text-slate-400">Open positions</h2>
        <PositionList />
      </div>
    </div>
  );
}