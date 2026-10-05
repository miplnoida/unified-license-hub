/** AML-CLOSE-06 — supervisory exception list of active cases without an eligible owner/reviewer. */
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { ASSIGNMENT_FLAG_LABEL, useOrphanCases } from '@/hooks/useAmlAssessmentReview';

export function AmlOrphanCasesAlert() {
  // The server refuses non-supervisors; a refusal simply hides this exception list.
  const { data } = useOrphanCases();
  if (!data || data.length === 0) return null;
  return (
    <Alert variant="destructive" data-testid="aml-orphan-cases">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{data.length} active assessment{data.length === 1 ? '' : 's'} need reassignment</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1">
          {data.slice(0, 20).map((o) => (
            <li key={o.assessment_id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link className="font-mono underline" to={`/supervision/aml/assessments/${o.assessment_id}`}>{o.reference}</Link>
              {o.flags.map((f) => <Badge key={f} variant="outline">{ASSIGNMENT_FLAG_LABEL[f] ?? f}</Badge>)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
