import type { PipelineStatus } from '@/types';
import { STATUS_META } from '@/lib/status';

export function StatusBadge({ status }: { status: PipelineStatus }) {
  const { label, className } = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
