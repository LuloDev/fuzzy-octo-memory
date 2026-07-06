import { AuditFeed } from '@/components/AuditFeed';

export function AuditPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-sm uppercase tracking-wide text-slate-400">Audit trail</h2>
      <p className="text-xs text-slate-500">
        Eventos cronológicos (más recientes primero). Click en una fila para expandir el payload.
      </p>
      <AuditFeed />
    </div>
  );
}