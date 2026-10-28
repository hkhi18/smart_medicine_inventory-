'use server';
// Server Actions shared by the whole app (run on the server, called from forms/buttons)
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ROLES } from '@/lib/roles';
import { audit } from '@/lib/audit';

export async function setRole(role) {
  if (!ROLES.some((r) => r.key === role)) return;
  const store = await cookies();
  store.set('role', role, { path: '/', sameSite: 'lax' });
  await audit(role, 'switch_role', 'session', `Role changed to ${role}`);
  revalidatePath('/', 'layout');
}
