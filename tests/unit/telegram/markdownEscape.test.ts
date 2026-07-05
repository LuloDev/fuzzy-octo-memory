import { describe, it, expect } from 'vitest';
import { formatAlert } from '@/backend/services/telegramNotifier';
import type { Alert } from '@/types/events';

describe('formatAlert MarkdownV2 escape', () => {
  it('escapes all MarkdownV2 special characters in dynamic fields', () => {
    const alert: Alert = {
      kind: 'BROKER_ERROR',
      title: 'Order rejected!',
      ticker: 'SPY.QQ',
      positionId: 'p_1.0',
      body: 'error: [timeout] (rate) {bad} ~ weird ~ `code`',
    };
    const out = formatAlert(alert);
    // Every special char inside text segments must be backslash-escaped.
    expect(out).toContain('\\!');
    expect(out).toContain('\\.');
    expect(out).toContain('\\_');
    expect(out).toContain('\\[');
    expect(out).toContain('\\(');
    expect(out).toContain('\\{');
    expect(out).toContain('\\~');
    expect(out).toContain('\\`');
  });

  it('keeps bold markers around the title', () => {
    const out = formatAlert({ kind: 'HEARTBEAT', title: 'Heartbeat', body: 'alive' });
    expect(out.startsWith('*')).toBe(true);
  });

  it('omits ticker/position lines when absent', () => {
    const out = formatAlert({ kind: 'HEARTBEAT', title: 'Heartbeat', body: 'alive' });
    expect(out).not.toContain('Ticker');
    expect(out).not.toContain('Position');
  });
});