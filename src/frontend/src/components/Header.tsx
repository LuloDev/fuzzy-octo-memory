import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getHealth, getKillState } from '@/lib/api';
import { HealthWidget } from './HealthWidget';
import { modeFromKillState, type Mode } from '@/lib/contracts';

const MODE_STYLE: Record<Mode, { cls: string; dot: string; label: string }> = {
  LIVE: { cls: 'bg-green-500/20 text-green-300', dot: 'bg-green-400', label: 'LIVE' },
  PAUSED_ENTRIES: { cls: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400', label: 'PAUSED: ENTRIES' },
  PAUSED_MANEUVERS: { cls: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400', label: 'PAUSED: MANEUVERS' },
  PAUSED_ALL: { cls: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400', label: 'PAUSED: ALL' },
  PANICKED: { cls: 'bg-red-500/20 text-red-300', dot: 'bg-red-400', label: 'PANICKED' },
};

export function Header() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: 30_000 });
  const { data: killState } = useQuery({ queryKey: ['killState'], queryFn: getKillState, refetchInterval: 5_000, staleTime: 0 });
  const dryRun = data?.dryRun ?? false;
  const mode: Mode = killState ? modeFromKillState(killState, Date.now()) : 'LIVE';
  const ms = MODE_STYLE[mode];
  return (
    <header className="bg-panel border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦅</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Iron Condor Bot</h1>
            <p className="text-xs text-slate-400 leading-tight">Automated weekly options</p>
          </div>
        </div>
        <nav className="flex gap-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/tickers"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`
            }
          >
            Tickers
          </NavLink>
          <NavLink
            to="/positions"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`
            }
          >
            Positions
          </NavLink>
          <NavLink
            to="/audit"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`
            }
          >
            Audit
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`
            }
          >
            Analytics
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <HealthWidget />
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${ms.cls}`}
            title={`mode=${mode}`}
          >
            <span className={`w-2 h-2 rounded-full ${ms.dot} animate-pulse`} />
            {ms.label}
          </span>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
              dryRun ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'
            }`}
            title={dryRun ? 'No broker traffic. Maneuvers are evaluated and logged.' : 'Live broker traffic.'}
          >
            <span className={`w-2 h-2 rounded-full ${dryRun ? 'bg-amber-400' : 'bg-green-400'} animate-pulse`} />
            {dryRun ? 'DRY-RUN' : 'LIVE'}
          </span>
          {data?.status === 'ok' && (
            <span className="text-xs text-slate-400">
              up {Math.floor((data.uptimeSeconds ?? 0) / 60)}m
            </span>
          )}
        </div>
      </div>
    </header>
  );
}