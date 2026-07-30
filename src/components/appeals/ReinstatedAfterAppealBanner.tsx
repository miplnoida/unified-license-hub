import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Gavel } from 'lucide-react';
import { useApplicationAppeals } from '@/hooks/useLicenseAppeals';
import { formatAppealDate } from '@/lib/licenseAppeals';

interface Props {
  applicationId: string;
  status: string;
}

/**
 * Shown on an application that was refused and then put back under review
 * because its appeal was accepted for consideration.
 */
export function ReinstatedAfterAppealBanner({ applicationId, status }: Props) {
  const { data: appeals } = useApplicationAppeals(applicationId);

  if (status === 'rejected') return null;
  const considered = (appeals || []).find((a) => a.decision === 'upheld');
  if (!considered) return null;

  return (
    <Alert>
      <Gavel className="h-4 w-4" />
      <AlertTitle>Reinstated after appeal</AlertTitle>
      <AlertDescription>
        This application was refused, then appealed ({considered.appeal_reference}). The appeal was
        accepted for consideration on {formatAppealDate(considered.decided_at)} and the application
        is back under review.
        {considered.decision_rationale ? ` Reason recorded: ${considered.decision_rationale}` : ''}
      </AlertDescription>
    </Alert>
  );
}
