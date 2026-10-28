'use server';
// Server Actions for alerts: acknowledge or resolve. Role is checked on the server every time.
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { currentRole, CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';

export async function updateAlert(formData) {
  const role = await currentRole();
  if (!CAN.handleAlert(role)) throw new Error('Your role cannot change alerts');
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!['acknowledged', 'resolved', 'open'].includes(status)) throw new Error('Invalid status');
  await query('UPDATE alerts SET status = $1, handled_by = $2, handled_at = now() WHERE id = $3', [status, role, id]);
  await audit(role, `alert_${status}`, `alert #${id}`, `Alert ${id} set to ${status}`);
  revalidatePath('/alerts');
  revalidatePath('/');
}
