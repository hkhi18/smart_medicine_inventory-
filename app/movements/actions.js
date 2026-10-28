'use server';
// Server Action: validate the form, post the movement in one database transaction.
import { revalidatePath } from 'next/cache';
import { currentRole, CAN } from '@/lib/roles';
import { postMovement, MOVEMENT_TYPES } from '@/lib/stock';

export async function postMovementAction(prevState, formData) {
  const role = await currentRole();
  if (!CAN.postMovement(role)) return { ok: false, message: `Role "${role}" cannot post movements.` };

  const input = {
    code: String(formData.get('code') || '').trim().toUpperCase(),
    type: String(formData.get('type') || ''),
    warehouse: String(formData.get('warehouse') || ''),
    toWarehouse: String(formData.get('toWarehouse') || ''),
    qty: Number(formData.get('qty')),
    lotNo: String(formData.get('lotNo') || '').trim(),
    expiry: String(formData.get('expiry') || '') || null,
    note: String(formData.get('note') || '').trim(),
    actor: role
  };
  if (!/^MED-\d{5}$/.test(input.code)) return { ok: false, message: 'Medicine code must look like MED-00001.' };
  if (!MOVEMENT_TYPES.includes(input.type)) return { ok: false, message: 'Choose a movement type.' };
  if (!Number.isInteger(input.qty) || input.qty <= 0) return { ok: false, message: 'Quantity must be a whole number above 0.' };

  try {
    const r = await postMovement(input);
    revalidatePath('/movements');
    revalidatePath('/');
    return { ok: true, message: `${r.detail}. New status: ${r.status} (on hand ${r.onHand}).` };
  } catch (err) {
    return { ok: false, message: err.message };   // transaction rolled back - nothing saved
  }
}
