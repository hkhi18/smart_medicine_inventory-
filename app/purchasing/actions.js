'use server';
// Server Actions: a pharmacist approves or rejects purchase-order drafts.
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { currentRole, CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';

export async function decidePurchaseOrder(formData) {
  const role = await currentRole();
  if (!CAN.approvePurchase(role)) throw new Error('Only a pharmacist can approve or reject purchase orders');
  const id = Number(formData.get('id'));
  const decision = String(formData.get('decision'));
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Invalid decision');
  const rows = await query(
    `UPDATE purchase_orders SET status = $1, decided_by = $2, decided_at = now()
     WHERE id = $3 AND status = 'awaiting_pharmacist' RETURNING qty, est_cost`, [decision, role, id]);
  if (rows.length) await audit(role, `po_${decision}`, `purchase_order #${id}`, `${decision}: ${rows[0].qty} units, ${rows[0].est_cost} SAR`);
  revalidatePath('/purchasing');
  revalidatePath('/');
}
