// Structured logging per Constitution Principle VI.
// Every evaluation and order emits a JSON line:
// { level, service, intent, ticker, positionId, pnl, timestamp }

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = {
  intent?: string;
  ticker?: string;
  positionId?: string;
  intentId?: string;
  pnl?: string;
  [k: string]: unknown;
};

function emit(level: LogLevel, service: string, msg: string, fields?: LogFields): void {
  const line = {
    level,
    service,
    msg,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // One JSON object per line; ready for jq / Loki.
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

export const logger = {
  debug: (service: string, msg: string, fields?: LogFields) => emit('debug', service, msg, fields),
  info: (service: string, msg: string, fields?: LogFields) => emit('info', service, msg, fields),
  warn: (service: string, msg: string, fields?: LogFields) => emit('warn', service, msg, fields),
  error: (service: string, msg: string, fields?: LogFields) => emit('error', service, msg, fields),
};