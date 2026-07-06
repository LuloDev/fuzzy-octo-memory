import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditFeed } from '@/lib/api';
import { verbColor, type AuditEvent } from '@/lib/contracts';

// US4 — Reverse-chronological feed of every PositionEvent + OrderSubmission.
// Each row expands to reveal the JSON payload, with truncation flagged.

function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const obj = value as { _truncated?: unknown; preview?: unknown };
  const isTruncated = obj._truncated === true;
  const display = isTruncated ? obj.preview : value;
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      {isTruncated && (
        <div className="text-[10px] text-amber-400 mb-1">[truncated — preview shown]</div>
      )}
      <pre className="text-[11px] font-mono bg-ink rounded p-2 overflow-x-auto text-slate-300">
        {JSON.stringify(display, null, 2)}
      </pre>
    </div>
  );
}

function Row({ evt }: { evt: AuditEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-800/40"
      >
        <span className="text-[11px] font-mono text-slate-400 w-40 shrink-0">
          {new Date(evt.ts).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${verbColor(evt.verb)}`}>
          {evt.verb}
        </span>
        <span className="text-sm text-slate-200 flex-1 truncate">{evt.summary}</span>
        {evt.intentId && (
          <span
            className="text-[10px] font-mono text-slate-400 bg-slate-700/40 px-1.5 py-0.5 rounded cursor-pointer"
            title="click to copy"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(evt.intentId ?? '');
            }}
          >
            {evt.intentId.slice(0, 8)}…
          </span>
        )}
        <span className="text-slate-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="text-[10px] text-slate-500 mb-2">
            id {evt.id} · position {evt.positionId} · source {evt.source}
            {evt.alpacaOrderId ? ` · alpaca ${evt.alpacaOrderId}` : ''}
          </div>
          <Payload label="Intent" value={evt.intentPayload} />
          <Payload label="Market snapshot" value={evt.marketSnapshot} />
          <Payload label="Order request" value={evt.requestPayload} />
          <Payload label="Order response" value={evt.responsePayload} />
        </div>
      )}
    </div>
  );
}

export function AuditFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-feed'],
    queryFn: () => getAuditFeed({ limit: 200 }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  if (isLoading) return <div className="text-sm text-slate-400">Loading audit trail…</div>;
  if (!data || data.items.length === 0) {
    return <div className="p-6 text-sm text-slate-400 text-center">Sin eventos registrados todavía.</div>;
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wide">Audit trail</h3>
        <span className="text-xs text-slate-500">{data.items.length} eventos · {data.truncatedCount} truncados</span>
      </div>
      <div className="rounded-lg bg-panel border border-slate-700 overflow-hidden">
        {data.items.map((evt) => (
          <Row key={`${evt.source}-${evt.id}`} evt={evt} />
        ))}
      </div>
    </div>
  );
}