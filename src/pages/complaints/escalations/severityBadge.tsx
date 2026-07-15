import { Badge } from '@/components/ui/badge';
import type { Severity } from './types';

const MAP: Record<Severity, string> = {
  critical: 'bg-red-50 text-red-800 border-red-200',
  high: 'bg-amber-50 text-amber-800 border-amber-200',
  medium: 'bg-blue-50 text-blue-800 border-blue-200',
  low: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge variant="outline" className={MAP[severity]}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

const STATUS_MAP: Record<string, string> = {
  pending: 'bg-red-50 text-red-800 border-red-200',
  acknowledged: 'bg-blue-50 text-blue-800 border-blue-200',
  escalated: 'bg-purple-50 text-purple-800 border-purple-200',
  dismissed: 'bg-slate-50 text-slate-700 border-slate-200',
  snoozed: 'bg-amber-50 text-amber-800 border-amber-200',
  auto_notified: 'bg-green-50 text-green-800 border-green-200',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_MAP[status] || 'bg-white text-slate-800 border-slate-200'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
