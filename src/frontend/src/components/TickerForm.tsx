import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTicker } from '@/lib/api';
import type { CreateTicker } from '@/lib/contracts';

// Defaults are spec § T040 / Quickstart V1: SPY, 0.12 delta, 2.00 width, 50% TP, 3× SL.
const DEFAULT_FORM: CreateTicker = {
  symbol: 'SPY',
  enabled: true,
  automaticManeuversEnabled: true,
  allocationPercentage: '30',
  targetDelta: '0.12',
  widthOfSpread: '2.00',
  takeProfitPercentage: '0.50',
  stopLossMultiplier: '3.00',
  dailyLossLimit: '-0.03',
};

export function TickerForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTicker>(DEFAULT_FORM);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateTicker) => createTicker(input),
    onSuccess: (r) => {
      setFeedback(`Created ${r.symbol}.`);
      qc.invalidateQueries({ queryKey: ['tickers'] });
    },
    onError: (e: Error) => setFeedback(`Error: ${e.message}`),
  });

  const update = <K extends keyof CreateTicker>(k: K, v: CreateTicker[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="bg-panel border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Add ticker</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Field
          label="Symbol"
          hint="Ticker del subyacente, p.ej. SPY o QQQ. El bot abre un Iron Condor semanal sobre este."
          value={form.symbol}
          onChange={(v) => update('symbol', v.toUpperCase())}
        />
        <Field
          label="Allocation %"
          hint="% del capital de la cuenta asignado a este ticker. Reparte el buying power entre los tickers activos."
          value={form.allocationPercentage}
          onChange={(v) => update('allocationPercentage', v)}
        />
        <Field
          label="Target delta"
          hint="Delta objetivo de los strikes cortos (0.12 ≈ 12-delta). Más bajo = más OTM = más seguro pero menos crédito."
          value={form.targetDelta}
          onChange={(v) => update('targetDelta', v)}
        />
        <Field
          label="Spread width"
          hint="Ancho del spread en USD entre strike corto y largo (2.00 = $2). Define el riesgo máximo por contrato."
          value={form.widthOfSpread}
          onChange={(v) => update('widthOfSpread', v)}
        />
        <Field
          label="Take-profit %"
          hint="% del crédito a capturar antes de cerrar (0.50 = cierra al cobrar 50% del máximo). Más alto = más ganancia pero más tiempo expuesto."
          value={form.takeProfitPercentage}
          onChange={(v) => update('takeProfitPercentage', v)}
        />
        <Field
          label="Stop-loss ×"
          hint="Múltiplo del crédito que dispara el stop (3.00 = cierra si cuesta 3× lo recibido). Tapa el riesgo por trade."
          value={form.stopLossMultiplier}
          onChange={(v) => update('stopLossMultiplier', v)}
        />
        <Field
          label="Daily loss limit"
          hint="Pérdida diaria máxima como fracción de la asignación (-0.03 = -3%). Al cruzarla, se frenan nuevas entradas del día."
          value={form.dailyLossLimit}
          onChange={(v) => update('dailyLossLimit', v)}
        />
        <div className="flex flex-col gap-2 justify-end">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300" title="Si está activo, el bot abre posiciones nuevas en cada ciclo semanal.">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
              className="rounded"
            />
            enabled
          </label>
          <label
            className="inline-flex items-center gap-2 text-xs text-slate-300"
            title="Si está activo, TP/SL/roll se ejecutan solos. Si no, el bot solo registra qué hubiera hecho (modo log-only)."
          >
            <input
              type="checkbox"
              checked={form.automaticManeuversEnabled}
              onChange={(e) => update('automaticManeuversEnabled', e.target.checked)}
              className="rounded"
            />
            auto-maneuver
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => {
            setFeedback(null);
            mutation.mutate(form);
          }}
          disabled={mutation.isPending}
          className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {mutation.isPending ? 'Creating…' : 'Create ticker'}
        </button>
        {feedback && <span className="text-xs text-slate-300">{feedback}</span>}
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