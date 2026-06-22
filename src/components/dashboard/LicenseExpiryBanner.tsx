import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLicenseExpiryStatus } from '@/hooks/useLicenseExpiryStatus';

interface Props {
  userId: string | undefined;
}

export function LicenseExpiryBanner({ userId }: Props) {
  const navigate = useNavigate();
  const { data: statuses } = useLicenseExpiryStatus(userId);

  if (!statuses || statuses.length === 0) return null;

  return (
    <div className="space-y-3 animate-slide-up">
      {statuses.map((s) => {
        const expiredOn = s.valid_until ? new Date(s.valid_until).toLocaleDateString() : '';
        const graceEndsOn = s.grace_ends_on ? new Date(s.grace_ends_on).toLocaleDateString() : '';

        // 1) In grace — license still usable. No renew button.
        if (s.in_grace_period) {
          return (
            <Alert key={s.license_id} className="border-warning/40 bg-warning/5">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>
                License {s.license_number || ''} is in grace period until {graceEndsOn}
              </AlertTitle>
              <AlertDescription>
                Expired on {expiredOn}. The license remains valid through the grace period. Renewal opens once grace ends.
              </AlertDescription>
            </Alert>
          );
        }

        // 2) Past grace — destructive, show renew button.
        if (s.is_expired) {
          return (
            <Alert key={s.license_id} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                License {s.license_number || ''} grace period has ended
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
                <span>
                  Expired on {expiredOn}. Grace ended {graceEndsOn}. Please renew to restore your license.
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/licenses/${s.license_id}?action=renew`)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Renew License
                </Button>
              </AlertDescription>
            </Alert>
          );
        }

        // 3) Reminder window — countdown only.
        return (
          <Alert key={s.license_id}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              License {s.license_number || ''} expires in {s.days_until_expiry} day
              {s.days_until_expiry === 1 ? '' : 's'}
            </AlertTitle>
            <AlertDescription>
              Valid until {expiredOn}.
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
