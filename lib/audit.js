// Write one row to the audit log (who did what, to which record)
import { query } from './db.js';

export async function audit(actor, action, entity, details) {
  await query('INSERT INTO audit_log (actor, action, entity, details) VALUES ($1, $2, $3, $4)', [actor, action, entity, details]);
}
