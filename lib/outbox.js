
import crypto from 'node:crypto';

export function checkOutboxKey(request) {
  const expected = process.env.OUTBOX_API_KEY || '';
  const given = request.headers.get('x-outbox-key') || '';

  if (expected.length < 16) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(given);

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}
