// Role handling: the current role is stored in a cookie and checked inside every Server Action.
import { cookies } from 'next/headers';
import { ROLES } from './roles-list.js';

export { ROLES };

export async function currentRole() {
  const store = await cookies();
  const r = store.get('role')?.value;
  return ROLES.some((x) => x.key === r) ? r : 'pharmacist';
}

// What each role may do
export const CAN = {
  approvePurchase: (role) => role === 'pharmacist',
  postMovement: (role) => role === 'pharmacist' || role === 'supply_chain',
  handleAlert: (role) => role === 'pharmacist' || role === 'supply_chain'
};
