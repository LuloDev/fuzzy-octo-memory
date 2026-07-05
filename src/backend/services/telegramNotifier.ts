import { env } from '@/backend/config/env';
import { logger } from '@/backend/services/structuredLogger';
import type { Alert, AlertKind } from '@/types/events';

// Telegram MarkdownV2 reserved characters that MUST be escaped inside text segments.
const MD2_RESERVED = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

function escape(input: string): string {
  return input.replace(MD2_RESERVED, '\\$1');
}

export function formatAlert(alert: Alert): string {
  // Bold is allowed via *…* but inside it the text must be escaped.
  const t = escape(alert.ticker ?? '');
  const pid = escape(alert.positionId ?? '');
  const pnl = alert.pnl ? escape(alert.pnl) : '';
  const pnlLine = pnl ? `\n*PnL:* ${pnl}` : '';
  const tickerLine = t ? `\n*Ticker:* ${t}` : '';
  const pidLine = pid ? `\n*Position:* ${pid}` : '';
  return `*${escape(alert.title)}*${tickerLine}${pidLine}${pnlLine}\n${escape(alert.body)}`;
}

// HTTP client. Returns true on 2xx, false otherwise. Never throws.
async function postTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    logger.warn('telegram', 'send failed', { error: (err as Error).message });
    return false;
  }
}

export class TelegramNotifier {
  constructor(
    private readonly botToken: string = env.TELEGRAM_BOT_TOKEN,
    private readonly chatId: string = env.TELEGRAM_CHAT_ID,
    private readonly maxRetries: number = 2,
    private readonly sleeper: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async send(alert: Alert): Promise<boolean> {
    const text = formatAlert(alert);
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (await postTelegram(this.botToken, this.chatId, text)) {
        const f: Record<string, string> = { kind: alert.kind };
        if (alert.ticker !== undefined) f.ticker = alert.ticker;
        logger.info('telegram', 'alert sent', f);
        return true;
      }
      // exponential backoff
      if (attempt < this.maxRetries) {
        const delay = 250 * 2 ** attempt;
        await this.sleeper(delay);
      }
    }
    logger.error('telegram', 'alert failed after retries', { kind: alert.kind });
    return false;
  }

  /** Used by US5 dead-man's switch to assert no message was missed. */
  async heartbeat(): Promise<boolean> {
    return this.send({
      kind: 'HEARTBEAT' as AlertKind,
      title: 'Heartbeat',
      body: `alive at ${new Date().toISOString()}`,
    });
  }
}

export const telegram = new TelegramNotifier();