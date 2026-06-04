import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { useLicenseStatusGate } from '@/hooks/useLicenseStatusGate';

/**
 * Renders a destructive alert when the current licensee's license is
 * suspended/revoked/expired/etc. Renders nothing otherwise.
 */
export function LicenseStatusBanner({ className }: { className?: string }) {
  const { isBlocked, blockedReason, status } = useLicenseStatusGate();
  if (!isBlocked || !blockedReason) return null;
  return (
    <Alert variant="destructive" className={className}>
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle className="capitalize">License {status}</AlertTitle>
      <AlertDescription>{blockedReason}</AlertDescription>
    </Alert>
  );
}
