/**
 * EPR-01 — legacy return identifier resolver.
 *
 * Call sites that only hold a legacy `returns_filed.id` link here via
 * `objectRoute.returnFilingFromLegacy()`. The canonical filing id is resolved
 * SERVER-side (`returns_resolve_legacy_filing`) — never guessed in the browser —
 * and the user lands on the canonical filing workspace.
 */
import { Navigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useResolveLegacyFiling } from '@/hooks/useWaveC';
import { objectRoute } from '@/lib/routes/objectRoutes';

/**
 * `target` selects the canonical spine the user is returned to:
 *  - 'internal' → /returns/filings/:filingId (supervisory workspace)
 *  - 'external' → /entity/returns/filings/:filingId (filer workspace)
 */
export default function LegacyReturnFilingRedirect({ target = 'internal' }: { target?: 'internal' | 'external' }) {
  const params = useParams<{ legacyId?: string; id?: string }>();
  const legacyId = params.legacyId ?? params.id;
  const { data, isLoading, error } = useResolveLegacyFiling(legacyId);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Opening the canonical return filing…
        </div>
      </DashboardLayout>
    );
  }

  if (data) {
    const href = target === 'external'
      ? `/entity/returns/filings/${encodeURIComponent(data)}`
      : objectRoute.returnFiling(data);
    return <Navigate to={href} replace />;
  }

  return (
    <DashboardLayout>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>This historical return has no canonical filing</AlertTitle>
        <AlertDescription>
          {error
            ? 'The canonical filing could not be resolved for this historical record.'
            : target === 'external'
              ? 'This record exists only in the retired returns store, so there is no current filing to open. Use “Returns” for your active obligations; historical records remain viewable under Returns → Historical records.'
              : 'This record exists only in the retired returns store, so there is no supervisory filing to open. Use the returns filing queue for current obligations.'}
        </AlertDescription>
      </Alert>
    </DashboardLayout>
  );
}
