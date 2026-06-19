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

/**
 * Returns the effective license status, treating an `active` license whose
 * `valid_until` is in the past as `expired`. UI safety net for when the daily
 * `mark_expired_licenses()` job hasn't run yet.
 */
export function resolveLicenseStatus(status?: string | null, validUntil?: string | null): string {
  const key = (status || 'pending').toLowerCase();
  if (key === 'active' && validUntil) {
    const t = new Date(validUntil).getTime();
    if (Number.isFinite(t) && t < Date.now()) return 'expired';
  }
  return key;
}

export function LicenseStatusBadge({ status, validUntil }: { status?: string | null; validUntil?: string | null }) {
  const key = resolveLicenseStatus(status, validUntil);
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_CLASSES[key] || ''}`}>
      {STATUS_LABELS[key] || key}
    </Badge>
  );
}
