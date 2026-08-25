import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, ShieldAlert } from 'lucide-react';
import { useLicenseEntitlements } from '@/hooks/useLicenseEntitlements';
import { LicenseStatusBanner } from '@/components/shared/LicenseStatusBanner';

/**
 * Contextual licence-entitlement state for the external Returns workspace.
 *
 * Route access to Returns is a portal-identity decision; whether NEW return
 * activity is permitted is a licence-entitlement decision. This component
 * renders the entitlement/licence-status explanation in-page so licence state
 * is never surfaced as a generic "Access Denied".
 *
 * Renders nothing when the active entity holds an eligible licence.
 */
export function ReturnsEntitlementNotice({ licenseeId }: { licenseeId?: string | null }) {
  const { loading, licenses, hasEligibleLicense, unavailableReason } = useLicenseEntitlements(licenseeId);

  if (loading || hasEligibleLicense) return null;

  // Licences exist but none permit new activity (suspended / revoked / expired):
  // reuse the shared licence-status banner where it applies, plus the reason.
  if (licenses.length > 0) {
    return (
      <div className="space-y-3">
        <LicenseStatusBanner />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>New return activity unavailable</AlertTitle>
          <AlertDescription>
            {unavailableReason
              || 'Return submission is currently unavailable for this licence. You can still view permitted historical filings.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Returns not available yet</AlertTitle>
      <AlertDescription>
        {unavailableReason
          || 'Regulatory Returns will become available once your licence has been approved and issued.'}
      </AlertDescription>
    </Alert>
  );
}

export default ReturnsEntitlementNotice;
