import { STATUS_LABEL } from '@/lib/format';

// Coloured status badge
export default function Pill({ value, label }) {
  return <span className={`pill ${value}`}>{label || STATUS_LABEL[value] || String(value).replace(/_/g, ' ')}</span>;
}
