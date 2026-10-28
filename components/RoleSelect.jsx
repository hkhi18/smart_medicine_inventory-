'use client';
// Client Component: a <select> that calls a Server Action when the role changes
import { useTransition } from 'react';
import { setRole } from '@/app/actions';
import { ROLES } from '@/lib/roles-list';

export default function RoleSelect({ role }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="role-select"
      defaultValue={role}
      disabled={pending}
      aria-label="Current role"
      onChange={(e) => start(() => setRole(e.target.value))}
    >
      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
    </select>
  );
}
