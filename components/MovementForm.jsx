'use client';
// Client Component: the movement form. useActionState() shows the result returned by the Server Action.
import { useActionState, useState } from 'react';
import { postMovementAction } from '@/app/movements/actions';

export default function MovementForm({ warehouses, canPost }) {
  const [state, formAction, pending] = useActionState(postMovementAction, null);
  const [type, setType] = useState('ISSUE');
  const incoming = type === 'RECEIPT' || type === 'RETURN';

  return (
    <form action={formAction}>
      {state && <div className={`notice ${state.ok ? 'ok' : 'err'}`}>{state.message}</div>}
      <div className="form-grid">
        <label>Medicine code<input name="code" placeholder="MED-00165" required /></label>
        <label>Movement type
          <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ISSUE">ISSUE — dispense to patient/ward (out)</option>
            <option value="RECEIPT">RECEIPT — goods received from supplier (in)</option>
            <option value="RETURN">RETURN — returned to stock (in)</option>
            <option value="TRANSFER">TRANSFER — move between warehouses</option>
            <option value="ADJUSTMENT">ADJUSTMENT — write-off / damage / expiry (out)</option>
          </select>
        </label>
        <label>Quantity<input name="qty" type="number" min="1" step="1" required /></label>
        <label>{type === 'TRANSFER' ? 'From warehouse' : 'Warehouse'}
          <select name="warehouse">{warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}</option>)}</select>
        </label>
        {type === 'TRANSFER' && (
          <label>To warehouse
            <select name="toWarehouse">{warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}</option>)}</select>
          </label>
        )}
        {incoming && <label>Lot number (blank = new lot)<input name="lotNo" placeholder="auto" /></label>}
        {incoming && <label>Expiry date (new lot)<input name="expiry" type="date" /></label>}
        <label style={{ gridColumn: 'span 2' }}>Note {type === 'ADJUSTMENT' && '(required)'}<input name="note" placeholder="e.g. Ward 5 request #1234" /></label>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn primary" type="submit" disabled={pending || !canPost}>{pending ? 'Posting…' : 'Post movement'}</button>
        <span className="med-meta" style={{ fontFamily: 'inherit' }}>Out-movements take stock First-Expiry-First-Out (FEFO).</span>
      </div>
    </form>
  );
}
