// US4 — Audit feed endpoint. Merges PositionEvent + OrderSubmission rows in
// reverse chronological order with cursor pagination, JSON-payload
// truncation, and zod-validated querystring.

import type { FastifyInstance } from 'fastify';
import { dbUnsafe } from '@/backend/services/persistenceService';
import { truncateIfLarge } from '@/backend/util/jsonTruncate';
import {
  type AuditEventDto,
  type AuditFeedDto,
  type AuditFeedQuery,
  type EventVerb,
  AuditFeedQuery as AuditFeedQuerySchema,
} from '@/shared/contracts';

type Cursor = { ts: string; id: string };
function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts}|${c.id}`).toString('base64url');
}
function decodeCursor(c: string): Cursor | null {
  try {
    const [ts, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
    if (!ts || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

const VERB_BY_KIND: Record<string, EventVerb> = {
  OPENED: 'ACTION',
  TAKE_PROFIT_TRIGGERED: 'ACTION',
  STOP_LOSS_TRIGGERED: 'ACTION',
  UNTESTED_ROLL: 'ALERT',
  ROLL_EXECUTED: 'ACTION',
  PANIC_CLOSED: 'ACTION',
  HEARTBEAT: 'MONITORING',
  OPEN_REJECTED: 'REJECTED',
  KILL_STATE_CHANGED: 'PAUSED',
  PAUSED_FOR_MANEUVERS: 'PAUSED',
  MID_OBSERVED: 'MONITORING',
};

function buildSummary(evt: { kind: string; realizedPnL: unknown }): string {
  const kind = evt.kind;
  if (kind === 'HEARTBEAT') return 'Heartbeat — engine alive';
  if (kind === 'OPENED') return 'Position opened';
  if (kind === 'PAUSED_FOR_MANEUVERS') return 'Maneuvers paused — intent logged but not executed';
  if (kind === 'OPEN_REJECTED') return 'Entry rejected';
  if (kind === 'KILL_STATE_CHANGED') return 'Kill switch toggled';
  if (kind === 'MID_OBSERVED') return 'Mid-price snapshot recorded';
  if (kind === 'PANIC_CLOSED') return 'Hard panic close';
  const pnl = evt.realizedPnL ? ` (PnL: ${String(evt.realizedPnL)})` : '';
  return `${kind}${pnl}`;
}

export async function auditFeedRoutes(app: FastifyInstance): Promise<void> {
  const a = app.withTypeProvider();

  a.get(
    '/events',
    { schema: { querystring: AuditFeedQuerySchema } },
    async (req): Promise<AuditFeedDto> => {
      const query = req.query as AuditFeedQuery;
      const { limit, cursor, intentId, positionId } = query;
      const decodedCursor = cursor ? decodeCursor(cursor) : null;

      // Two parallel queries (per research.md recommendation — portable to
      // Postgres, simple filters, in-memory merge is trivially cheap).
      const [events, orders] = await Promise.all([
        dbUnsafe().positionEvent.findMany({
          where: {
            ...(positionId ? { positionId } : {}),
            // Keyset on (createdAt, id) when a cursor is provided.
            ...(decodedCursor
              ? {
                  OR: [
                    { createdAt: { lt: new Date(decodedCursor.ts) } },
                    {
                      AND: [
                        { createdAt: new Date(decodedCursor.ts) },
                        { id: { lt: decodedCursor.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
        }),
        dbUnsafe().orderSubmission.findMany({
          where: {
            ...(positionId ? { positionId } : {}),
            ...(intentId ? { intentId } : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    { submittedAt: { lt: new Date(decodedCursor.ts) } },
                    {
                      AND: [
                        { submittedAt: new Date(decodedCursor.ts) },
                        { id: { lt: decodedCursor.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          take: limit,
        }),
      ]);

      let truncatedCount = 0;
      const items: AuditEventDto[] = [];

      for (const e of events) {
        let snapshotJson: unknown = null;
        if (e.marketSnapshot) {
          try {
            snapshotJson = JSON.parse(e.marketSnapshot);
          } catch {
            snapshotJson = e.marketSnapshot;
          }
        }
        let intentJson: unknown = null;
        if (e.intentPayload) {
          try {
            intentJson = JSON.parse(e.intentPayload);
          } catch {
            intentJson = e.intentPayload;
          }
        }
        const snap = truncateIfLarge(snapshotJson);
        if ((snap as { _truncated?: boolean })._truncated) truncatedCount++;
        const ip = truncateIfLarge(intentJson);
        if ((ip as { _truncated?: boolean })._truncated) truncatedCount++;
        items.push({
          id: e.id,
          source: 'position_event',
          positionId: e.positionId,
          intentId: null,
          kind: e.kind,
          verb: VERB_BY_KIND[e.kind] ?? 'MONITORING',
          summary: buildSummary({ kind: e.kind, realizedPnL: e.realizedPnL }),
          ticker: null,
          ts: e.createdAt.toISOString(),
          alpacaOrderId: null,
          intentPayload: ip,
          marketSnapshot: snap,
          realizedPnL: e.realizedPnL ? String(e.realizedPnL) : null,
        });
      }

      for (const o of orders) {
        let reqJson: unknown = null;
        if (o.requestPayload) {
          try {
            reqJson = JSON.parse(o.requestPayload);
          } catch {
            reqJson = o.requestPayload;
          }
        }
        let respJson: unknown = null;
        if (o.responsePayload) {
          try {
            respJson = JSON.parse(o.responsePayload);
          } catch {
            respJson = o.responsePayload;
          }
        }
        const req = truncateIfLarge(reqJson);
        const resp = truncateIfLarge(respJson);
        if ((req as { _truncated?: boolean })._truncated) truncatedCount++;
        if ((resp as { _truncated?: boolean })._truncated) truncatedCount++;
        items.push({
          id: o.id,
          source: 'order_submission',
          positionId: o.positionId,
          intentId: o.intentId,
          kind: o.status,
          verb: 'ACTION',
          summary: `Order ${o.status} (intent ${o.intentId.slice(0, 8)}…)`,
          ticker: null,
          ts: o.submittedAt.toISOString(),
          alpacaOrderId: o.alpacaOrderId ?? null,
          requestPayload: req,
          responsePayload: resp,
        });
      }

      items.sort((a, b) => {
        if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
      const sliced = items.slice(0, limit);
      const last = sliced[sliced.length - 1];
      const nextCursor = sliced.length === limit && last ? encodeCursor({ ts: last.ts, id: last.id }) : null;

      return { items: sliced, nextCursor, truncatedCount };
    },
  );
}