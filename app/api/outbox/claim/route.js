// POST /api/outbox/claim - the Outlook bot asks for the next e-mail to send.
// The row is marked "sending" in the same statement, so two bots can never take the same e-mail.
import { query } from '@/lib/db';
import { checkOutboxKey } from '@/lib/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!checkOutboxKey(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await query(`
    UPDATE outbound_emails
    SET status = 'sending', attempts = attempts + 1, claimed_at = now()
    WHERE id = (
      SELECT id FROM outbound_emails
      WHERE status = 'pending'
      ORDER BY id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, reference, to_email, cc_email, subject, body, level
  `);

  return Response.json({ email: rows[0] || null });
}