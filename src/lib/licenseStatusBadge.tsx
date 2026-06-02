import { Badge } from '@/components/ui/badge';

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  suspended: 'bg-amber-500/10 text-amber-700 border-amber-200',
  revoked: 'bg-red-500/10 text-red-700 border-red-200',
  cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  expired: 'bg-slate-500/10 text-slate-700 border-slate-200',
  inactive: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-blue-500/10 text-blue-700 border-blue-200',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
  expired: 'Expired',
  inactive: 'Inactive',
  pending: 'Pending',
};

export function LicenseStatusBadge({ status }: { status?: string | null }) {
  const key = (status || 'pending').toLowerCase();
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_CLASSES[key] || ''}`}>
      {STATUS_LABELS[key] || key}
    </Badge>
  );
}
