import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { listTickers, updateTicker } from '@/lib/api';
import { fmtMoney, signClass } from '@/lib/contracts';
import type { TickerConfig, UpdateTicker } from '@/lib/contracts';

export function TickerList() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickers'],
    queryFn: listTickers,
  });
  const [editing, setEditing] = useState<TickerConfig | null>(null);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTicker }) => updateTicker(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickers'] });
      setEditing(null);
    },
  });

  if (isLoading) {
    return <div className="bg-panel rounded-lg p-4 h-32 animate-pulse" />;
  }
  if (error) {
    return <div className="text-red-400 text-sm">Failed to load tickers: {(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="bg-panel rounded-lg p-6 border border-slate-700 text-slate-400 text-sm">
        No tickers configured yet. Use the form to add SPY, QQQ, etc.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm bg-panel rounded-lg border border-slate-700 overflow-hidden">
        <thead className="bg-slate-800 text-slate-300 text-xs uppercase">
          <tr>
            <th className="text-left p-3">Symbol</th>
            <th className="text-left p-3">Enabled</th>
            <th className="text-left p-3">Auto-maneuver</th>
            <th className="text-right p-3">Δ</th>
            <th className="text-right p-3">Width</th>
            <th className="text-right p-3">TP%</th>
            <th className="text-right p-3">SL×</th>
            <th className="text-right p-3">Allocation %</th>
            <th className="text-right p-3">Daily limit</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((t) => (
            <tr key={t.id} className="hover:bg-slate-800/50">
              <td className="p-3 font-semibold">{t.symbol}</td>
              <td className="p-3">
                <ToggleBadge on={t.enabled} onClick={() => update.mutate({ id: t.id, patch: { enabled: !t.enabled } })} />
              </td>
              <td className="p-3">
                <ToggleBadge
                  on={t.automaticManeuversEnabled}
                  onClick={() =>
                    update.mutate({
                      id: t.id,
                      patch: { automaticManeuversEnabled: !t.automaticManeuversEnabled },
                    })
                  }
                />
              </td>
              <td className="p-3 text-right">{t.targetDelta}</td>
              <td className="p-3 text-right">{fmtMoney(t.widthOfSpread)}</td>
              <td className="p-3 text-right">{(parseFloat(t.takeProfitPercentage) * 100).toFixed(0)}%</td>
              <td className="p-3 text-right">{t.stopLossMultiplier}×</td>
              <td className="p-3 text-right">{t.allocationPercentage}%</td>
              <td className={`p-3 text-right ${signClass(t.dailyLossLimit)}`}>
                {(parseFloat(t.dailyLossLimit) * 100).toFixed(1)}%
              </td>
              <td className="p-3 text-right">
                <button
                  onClick={() => setEditing(t)}
                  className="text-xs text-sky-300 hover:text-sky-200"
                >
                  edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <EditModal ticker={editing} onClose={() => setEditing(null)} onSave={(patch) => update.mutate({ id: editing.id, patch })} />}
    </div>
  );
}

function ToggleBadge({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        on ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400'
      }`}
      aria-pressed={on}
    >
      {on ? '● ON' : '○ OFF'}
    </button>
  );
}

function EditModal({
  ticker,
  onClose,
  onSave,
}: {
  ticker: TickerConfig;
  onClose: () => void;
  onSave: (patch: UpdateTicker) => void;
}) {
  const [width, setWidth] = useState(ticker.widthOfSpread);
  const [tp, setTp] = useState(ticker.takeProfitPercentage);
  const [sl, setSl] = useState(ticker.stopLossMultiplier);
  const [delta, setDelta] = useState(ticker.targetDelta);
  const [alloc, setAlloc] = useState(ticker.allocationPercentage);
  const [daily, setDaily] = useState(ticker.dailyLossLimit);
  const [reason, setReason] = useState('dashboard edit');

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-panel border border-slate-700 rounded-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Edit {ticker.symbol}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field
            label="Target delta"
            hint="Delta objetivo de los strikes cortos. Más bajo = más OTM = más seguro, menos crédito."
            value={delta}
            onChange={setDelta}
          />
          <Field
            label="Spread width ($)"
            hint="Distancia en USD entre strike corto y largo. Define el riesgo máximo por contrato."
            value={width}
            onChange={setWidth}
          />
          <Field
            label="Take-profit %"
            hint="Fracción del crédito a capturar antes de cerrar (0.50 = 50% del máximo)."
            value={tp}
            onChange={setTp}
          />
          <Field
            label="Stop-loss ×"
            hint="Múltiplo del crédito que dispara el stop (3 = cierra si cuesta 3× lo recibido)."
            value={sl}
            onChange={setSl}
          />
          <Field
            label="Allocation %"
            hint="% del capital de la cuenta asignado a este ticker."
            value={alloc}
            onChange={setAlloc}
          />
          <Field
            label="Daily loss limit"
            hint="Pérdida diaria máxima como fracción de la asignación (-0.03 = -3%). Frena nuevas entradas."
            value={daily}
            onChange={setDaily}
          />
        </div>
        <div className="mt-3">
          <label className="block text-xs text-slate-400 mb-1">
            Reason <span className="text-slate-500">(se guarda en el log de auditoría)</span>
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-2 py-1 text-sm rounded bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                widthOfSpread: width,
                takeProfitPercentage: tp,
                stopLossMultiplier: sl,
                targetDelta: delta,
                allocationPercentage: alloc,
                dailyLossLimit: daily,
                reason,
              })
            }
            className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1" title={hint}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-sm rounded bg-slate-800 border border-slate-600 text-slate-100"
      />
      {hint && <p className="text-[11px] leading-snug text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}