import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Label,
} from 'recharts';
import { getPayoff } from '@/lib/api';
import { fmtMoney } from '@/lib/contracts';
import type { Position } from '@/lib/contracts';

type Props = { position: Position };

type Point = { price: number; pnl: number; profitPnl: number | null; lossPnl: number | null };

function interpolatePnl(curve: Point[], price: number): number {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (price >= a.price && price <= b.price) {
      const t = (price - a.price) / (b.price - a.price);
      return a.pnl + t * (b.pnl - a.pnl);
    }
  }
  return price < curve[0].price ? curve[0].pnl : curve[curve.length - 1].pnl;
}

export function PayoffChart({ position }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['payoff', position.id],
    queryFn: () => getPayoff(position.id),
  });

  if (isLoading) {
    return <div className="h-80 bg-panel rounded-xl animate-pulse" />;
  }
  if (!data) return null;

  const maxProfit = parseFloat(data.maxProfit);
  const maxLoss = parseFloat(data.maxLoss);
  const beLow = parseFloat(data.breakEvenLower);
  const beHigh = parseFloat(data.breakEvenUpper);
  const current = parseFloat(data.underlyingPrice);

  const sp = parseFloat(position.shortPutStrike);
  const sc = parseFloat(position.shortCallStrike);

  const hasCurrent = current > 0 && Number.isFinite(current);

  const curve: Point[] = data.curve.map((p) => {
    const price = parseFloat(p.price);
    const pnl = parseFloat(p.pnl);
    if (price >= beLow && price <= beHigh) {
      return { price, pnl, profitPnl: pnl, lossPnl: null };
    }
    return { price, pnl, profitPnl: null, lossPnl: pnl };
  });

  const currentPnl = hasCurrent ? interpolatePnl(curve, current) : null;

  const fullRange = maxProfit - maxLoss;
  let yDomain: [number, number];
  if (hasCurrent && currentPnl !== null && fullRange > 0) {
    // Always include maxProfit and maxLoss so the horizontal limit lines are visible
    const halfSpan = Math.max(fullRange * 0.25, Math.abs(maxProfit - currentPnl) + 80, Math.abs(currentPnl - maxLoss) + 80);
    const lo = Math.min(currentPnl - halfSpan, maxLoss - fullRange * 0.05);
    const hi = Math.max(currentPnl + halfSpan, maxProfit + fullRange * 0.05);
    yDomain = [lo, hi];
  } else {
    const pad = fullRange * 0.18;
    yDomain = [maxLoss - pad, maxProfit + pad];
  }

  return (
    <div className="bg-panel rounded-xl border border-slate-700 shadow-lg shadow-black/30 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-sky-400" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200 leading-none">Iron Condor — Payoff at expiry</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{position.symbol} · {position.expiration.slice(0, 10)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            <Kpi
              label="Max profit"
              value={`+${fmtMoney(data.maxProfit)}`}
              color="text-emerald-400"
              dot="bg-emerald-400"
            />
            <Kpi
              label="Max loss"
              value={fmtMoney(data.maxLoss)}
              color="text-red-400"
              dot="bg-red-400"
            />
            <Kpi
              label="Current PnL"
              value={currentPnl !== null ? `${currentPnl >= 0 ? '+' : ''}$${currentPnl.toFixed(2)}` : '—'}
              color={currentPnl !== null && currentPnl > 0 ? 'text-emerald-400' : currentPnl !== null && currentPnl < 0 ? 'text-red-400' : 'text-slate-400'}
              dot={currentPnl !== null && currentPnl > 0 ? 'bg-emerald-400' : currentPnl !== null && currentPnl < 0 ? 'bg-red-400' : 'bg-slate-500'}
            />
          </div>
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────── */}
      <div className="h-72 sm:h-80 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={curve}
            margin={{ top: 8, right: 18, left: 0, bottom: 4 }}
          >
            <defs>
              <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.04} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.35} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#1e293b" strokeDasharray="3 4" vertical={false} />

            <XAxis
              dataKey="price"
              stroke="#475569"
              fontSize={11}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              stroke="#475569"
              fontSize={11}
              domain={yDomain}
              tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}$${(v / 1).toFixed(0)}`}
              width={58}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              cursor={{ stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '3 3' }}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                fontSize: 12,
                padding: '8px 12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
              labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
              formatter={(v: number) => [`${v >= 0 ? '+' : ''}$${v.toFixed(2)}`, 'PnL']}
              labelFormatter={(l: number) => `Price $${l.toFixed(2)}`}
            />

            {/* Short strikes */}
            <ReferenceLine x={sp} stroke="#22d3ee" strokeWidth={2.5} strokeDasharray="8 4">
              <Label value={`SP $${sp.toFixed(0)}`} fill="#22d3ee" fontSize={11} fontWeight={600} position="insideBottomRight" />
            </ReferenceLine>
            <ReferenceLine x={sc} stroke="#22d3ee" strokeWidth={2.5} strokeDasharray="8 4">
              <Label value={`SC $${sc.toFixed(0)}`} fill="#22d3ee" fontSize={11} fontWeight={600} position="insideBottomLeft" />
            </ReferenceLine>

            {/* Break-evens */}
            <ReferenceLine x={beLow} stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4">
              <Label value={`BE $${beLow.toFixed(1)}`} fill="#fbbf24" fontSize={10} fontWeight={600} position="top" />
            </ReferenceLine>
            <ReferenceLine x={beHigh} stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4">
              <Label value={`BE $${beHigh.toFixed(1)}`} fill="#fbbf24" fontSize={10} fontWeight={600} position="top" />
            </ReferenceLine>

            {/* Max profit / max loss lines */}
            {yDomain[0] <= maxProfit && yDomain[1] >= maxProfit && (
              <ReferenceLine y={maxProfit} stroke="#22c55e" strokeDasharray="8 4" strokeWidth={2}>
                <Label value={`+${fmtMoney(data.maxProfit)}`} fill="#22c55e" fontSize={11} fontWeight={600} position="right" />
              </ReferenceLine>
            )}
            {yDomain[0] <= maxLoss && yDomain[1] >= maxLoss && (
              <ReferenceLine y={maxLoss} stroke="#ef4444" strokeDasharray="8 4" strokeWidth={2}>
                <Label value={fmtMoney(data.maxLoss)} fill="#ef4444" fontSize={11} fontWeight={600} position="right" />
              </ReferenceLine>
            )}

            {/* Zero line */}
            {yDomain[0] <= 0 && yDomain[1] >= 0 && (
              <ReferenceLine y={0} stroke="#64748b" strokeWidth={2} strokeDasharray="2 2" />
            )}

            {/* Current price — full vertical line across chart */}
            {hasCurrent && currentPnl !== null && (
              <>
                <ReferenceLine
                  x={current}
                  stroke="#f472b6"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  strokeOpacity={0.85}
                />
                <ReferenceDot
                  x={current}
                  y={currentPnl}
                  r={7}
                  fill={currentPnl >= 0 ? '#22c55e' : '#ef4444'}
                  stroke="#f472b6"
                  strokeWidth={3}
                >
                  <Label
                    value={`Now $${current.toFixed(2)}`}
                    fill="#f472b6"
                    fontSize={11}
                    fontWeight={700}
                    position={current < (beLow + beHigh) / 2 ? 'right' : 'left'}
                  />
                </ReferenceDot>
              </>
            )}

            {/* Areas */}
            <Area
              type="monotone"
              dataKey="profitPnl"
              stroke="none"
              fill="url(#profitFill)"
              baseValue={yDomain[0]}
              connectNulls
              isAnimationActive={false}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="lossPnl"
              stroke="none"
              fill="url(#lossFill)"
              baseValue={yDomain[0]}
              connectNulls
              isAnimationActive={false}
              dot={false}
            />

            {/* Line overlay on top of areas */}
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="#cbd5e1"
              strokeWidth={2.5}
              fill="none"
              isAnimationActive={true}
              animationDuration={700}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 5, fill: '#e2e8f0', stroke: '#0f172a', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  color,
  dot,
}: {
  label: string;
  value: string;
  color: string;
  dot: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 leading-none">{label}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className={`${color} font-bold leading-none font-mono text-[13px]`}>
          {value}
        </span>
      </div>
    </div>
  );
}
