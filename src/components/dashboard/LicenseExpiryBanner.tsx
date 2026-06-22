import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
        const variant = s.is_expired ? 'destructive' : 'default';
        const title = s.is_expired
          ? `License ${s.license_number || ''} has expired`
          : `License ${s.license_number || ''} expires in ${s.days_until_expiry} day${s.days_until_expiry === 1 ? '' : 's'}`;
        const desc = s.is_expired
          ? s.in_grace_period
            ? `Expired on ${new Date(s.valid_until!).toLocaleDateString()}. You are within the grace period — renew now to avoid disruption.`
            : `Expired on ${new Date(s.valid_until!).toLocaleDateString()}. Please renew immediately.`
          : `Valid until ${new Date(s.valid_until!).toLocaleDateString()}.`;
        return (
          <Alert key={s.license_id} variant={variant}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
              <span>{desc}</span>
              {s.is_expired && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/licenses/${s.license_id}?action=renew`)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Renew License
                </Button>
              )}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
