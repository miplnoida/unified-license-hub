import { Badge } from '@/components/ui/badge';

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  active_grace: 'bg-amber-500/10 text-amber-800 border-amber-200',
  suspended: 'bg-amber-500/10 text-amber-700 border-amber-200',
  revoked: 'bg-red-500/10 text-red-700 border-red-200',
  cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  expired: 'bg-slate-500/10 text-slate-700 border-slate-200',
  inactive: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-blue-500/10 text-blue-700 border-blue-200',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  active_grace: 'Active (Grace)',
  suspended: 'Suspended',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
  expired: 'Expired',
  inactive: 'Inactive',
  pending: 'Pending',
};

/**
 * Returns the effective license status. An `active` license whose `valid_until`
 * is past is treated as `expired`. When a grace period is supplied and we are
 * still inside it, the license is treated as `active_grace` (still valid).
 */
export function resolveLicenseStatus(
  status?: string | null,
  validUntil?: string | null,
  gracePeriodDays?: number,
): string {
  const key = (status || 'pending').toLowerCase();
  if (!validUntil) return key;
  const t = new Date(validUntil).getTime();
  if (!Number.isFinite(t)) return key;
  const now = Date.now();
  const graceEnds = t + Math.max(0, gracePeriodDays || 0) * 86_400_000;
  if ((key === 'active' || key === 'expired') && t < now) {
    if (graceEnds >= now) return 'active_grace';
    return 'expired';
  }
  return key;
}

export function LicenseStatusBadge({
  status,
  validUntil,
  gracePeriodDays,
}: {
  status?: string | null;
  validUntil?: string | null;
  gracePeriodDays?: number;
}) {
  const key = resolveLicenseStatus(status, validUntil, gracePeriodDays);
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_CLASSES[key] || ''}`}>
      {STATUS_LABELS[key] || key}
    </Badge>
  );
}
