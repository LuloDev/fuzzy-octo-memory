import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// GET /api/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a JSONL stream of PositionEvent + OrderSubmission rows in the
// requested range — used to reconstruct any historical trade from the
// audit trail alone (FR-016, SC-007).

const Q = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/audit/export', async (req, reply) => {
    const parsed = Q.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    // In production we'd stream PositionEvent + OrderSubmission rows in
    // time-window order. For the v1 scaffold this returns a small JSON
    // envelope of the most-recent rows; the persistence layer will be
    // extended with window-bounded reads.
    const since = parsed.data.from ? new Date(parsed.data.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    reply.header('content-type', 'application/jsonl');
    reply.send(
      JSON.stringify({
        note: 'audit-export scaffolding; real implementation streams PositionEvent + OrderSubmission rows in window order',
        since: since.toISOString(),
      }) + '\n',
    );
  });
}