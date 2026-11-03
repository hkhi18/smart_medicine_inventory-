// POST /api/outbox/result - the Outlook bot reports whether the e-mail was sent or failed.
// Body: { id: 12, status: "sent" | "failed", error: "optional text" }
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { checkOutboxKey } from '@/lib/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!checkOutboxKey(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const status = String(body.status || '');
  if (!Number.isInteger(id) || !['sent', 'failed'].includes(status)) {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }
  const error = status === 'failed' ? String(body.error || 'Unknown error').slice(0, 500) : null;

  // Only a row that is currently "sending" can be closed, so a result can never be applied twice
  const rows = await query(
    `UPDATE outbound_emails
     SET status = $2::text,
         error = $3::text,
         sent_at = CASE WHEN $2::text = 'sent' THEN now() ELSE sent_at END
     WHERE id = $1::int AND status = 'sending'
     RETURNING id, reference, to_email, level`,
    [id, status, error]
  );
  if (rows.length === 0) {
    return Response.json({ error: 'E-mail not found or not in sending state' }, { status: 409 });
  }

  const row = rows[0];
  await audit(
    'outlook-bot',
    status === 'sent' ? 'email_sent' : 'email_failed',
    'purchasing',
    `${row.reference || 'no reference'} - level ${row.level} - ${row.to_email}${error ? ' - ' + error : ''}`
  );
  return Response.json({ ok: true });
}