import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LicenseExpiryStatus } from '@/hooks/useLicenseExpiryStatus';

// Only treat a renewal as "in progress" once the licensee has actually
// submitted it. A draft/in-progress row should NOT suppress the Renew button
// — the duplicate-guard inside LicenseDetail.startRenewal will reopen that
// same draft if the user clicks Renew again.
const PENDING_RENEWAL_STATUSES = ['submitted', 'under_review', 'query_raised', 'resubmission_requested'];

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Renewal submitted',
  under_review: 'Under review',
  query_raised: 'Query raised',
  resubmission_requested: 'Resubmission requested',
};


const STATUS_BADGE: Record<string, 'approved' | 'destructive' | 'warning' | 'outline'> = {
  active: 'approved',
  expired: 'destructive',
  suspended: 'destructive',
  revoked: 'destructive',
  cancelled: 'destructive',
};

export interface LicenseRow {
  id: string;
  license_number: string | null;
  status: string;
  valid_until: string | null;
  /** Optional precomputed days until expiry; if missing it is derived from valid_until. */
  days_until_expiry?: number | null;
}

interface Props {
  licenses: LicenseRow[];
  expiryStatuses?: LicenseExpiryStatus[];
  /**
   * When 'expired-only' the Renew button shows only after the grace period
   * has ended. When 'expired-or-soon' it also shows for licenses in grace or
   * within 30 days of expiry. Defaults to 'expired-only'.
   */
  renewMode?: 'expired-only' | 'expired-or-soon';
  title?: string;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function LicenseStatusList({
  licenses,
  expiryStatuses = [],
  renewMode = 'expired-only',
  title = 'License status',
}: Props) {
  if (!licenses.length) return null;

  const pastGraceIds = new Set(expiryStatuses.filter(s => s.is_expired).map(s => s.license_id));
  const inGraceIds = new Set(expiryStatuses.filter(s => s.in_grace_period).map(s => s.license_id));

  // Fetch in-flight renewal applications for these licenses so we can hide the
  // Renew button (and surface the application instead) when one already exists.
  const [pendingRenewalByLicense, setPendingRenewalByLicense] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = licenses.map(l => l.id);
      if (ids.length === 0) { setPendingRenewalByLicense({}); return; }
      const { data } = await supabase
        .from('applications' as any)
        .select('id, status, data')
        .in('status', PENDING_RENEWAL_STATUSES as any);
      const rows = (data as any[]) || [];
      const next: Record<string, string> = {};
      for (const r of rows) {
        const lid = r?.data?.renewal_of_license_id;
        if (lid && ids.includes(lid) && !next[lid]) next[lid] = r.id;
      }
      if (!cancelled) setPendingRenewalByLicense(next);
    })();
    return () => { cancelled = true; };
  }, [licenses.map(l => l.id).join(',')]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {licenses.map((lic) => {
          const computedDays = lic.days_until_expiry ?? daysUntil(lic.valid_until);
          const inGrace = inGraceIds.has(lic.id);
          const isPastGrace = pastGraceIds.has(lic.id)
            || (lic.status === 'active' && computedDays !== null && computedDays < 0 && !inGrace);
          const isExpiringSoon = lic.status === 'active' && computedDays !== null && computedDays >= 0 && computedDays <= 30;

          const canRenew = renewMode === 'expired-only'
            ? isPastGrace
            : (isPastGrace || inGrace || isExpiringSoon);

          let badgeVariant: 'approved' | 'destructive' | 'warning' | 'outline';
          let badgeLabel: string;
          if (inGrace) {
            badgeVariant = 'warning';
            badgeLabel = 'In grace period';
          } else if (isPastGrace) {
            badgeVariant = 'destructive';
            badgeLabel = 'Expired';
          } else if (isExpiringSoon) {
            badgeVariant = 'warning';
            badgeLabel = computedDays === 0 ? 'Expires today' : `Expires in ${computedDays} day${computedDays === 1 ? '' : 's'}`;
          } else {
            badgeVariant = STATUS_BADGE[lic.status] || 'outline';
            badgeLabel = lic.status.charAt(0).toUpperCase() + lic.status.slice(1);
          }

          return (
            <div key={lic.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium text-foreground truncate">
                  {lic.license_number || lic.id.slice(0, 8)}
                </p>
                {lic.valid_until && (
                  <p className="text-xs text-muted-foreground">
                    Valid until {new Date(lic.valid_until).toLocaleDateString()}
                    {computedDays !== null && computedDays < 0
                      ? ` · expired ${Math.abs(computedDays)} day${Math.abs(computedDays) === 1 ? '' : 's'} ago`
                      : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={badgeVariant as any}>{badgeLabel}</Badge>
                {pendingRenewalByLicense[lic.id] ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/applications/${pendingRenewalByLicense[lic.id]}`}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />Renewal in progress
                    </Link>
                  </Button>
                ) : canRenew && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/licenses/${lic.id}?action=renew`}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />Renew
                    </Link>
                  </Button>
                )}
              </div>

            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
