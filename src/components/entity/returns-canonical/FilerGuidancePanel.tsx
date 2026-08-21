/**
 * EPR-01 — external filer guidance strip.
 *
 * Answers the four questions the regulated entity actually has, using ONLY
 * filer-facing facts (completion, validation issues they can resolve,
 * declaration, submission state, correction requests). Internal supervisory
 * facts — reviewer/owner, internal priority, internal SLA, queue ownership and
 * internal-only blockers — are deliberately NOT surfaced here.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, CircleAlert, Clock, HelpCircle } from 'lucide-react';
import { formatDateOnly } from '@/lib/datetime';

export interface FilerGuidanceInput {
  filingStatus: string;
  versionStatus: string | null;
  versionNumber: number | null;
  dueDate: string | null;
  requiresDeclaration: boolean;
  declarationAccepted: boolean;
  totalRequiredForms: number;
  completedRequiredForms: number;
  blockingIssues: number;
  warningIssues: number;
  openRequests: number;
  isEditable: boolean;
  isReadOnly: boolean;
}

interface Guidance {
  todo: string;
  complete: string;
  blocking: string[];
  regulator: string;
}

const SUBMITTED_STATES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'PENDING_REVIEW']);

export function deriveFilerGuidance(i: FilerGuidanceInput): Guidance {
  const outstandingForms = Math.max(0, i.totalRequiredForms - i.completedRequiredForms);
  const blocking: string[] = [];
  if (outstandingForms > 0) blocking.push(`${outstandingForms} required form(s) not yet complete`);
  if (i.blockingIssues > 0) blocking.push(`${i.blockingIssues} blocking validation issue(s) to resolve`);
  if (i.requiresDeclaration && !i.declarationAccepted && i.isEditable) blocking.push('Declaration not yet accepted');
  if (i.openRequests > 0) blocking.push(`${i.openRequests} open request(s) from the regulator awaiting your response`);

  const complete = i.totalRequiredForms > 0
    ? `${i.completedRequiredForms} of ${i.totalRequiredForms} required forms complete`
    : 'No forms are required for this return';

  let todo: string;
  let regulator: string;

  if (i.versionStatus === 'CORRECTION_REQUESTED') {
    todo = 'Make the requested corrections in this draft version, re-validate, then resubmit.';
    regulator = 'The regulator is waiting for your corrected submission.';
  } else if (i.versionStatus === 'REJECTED') {
    todo = 'Review the rejection rationale, prepare a new version and resubmit.';
    regulator = 'The regulator is waiting for a corrected resubmission.';
  } else if (i.versionStatus === 'ACCEPTED' || i.filingStatus === 'ACCEPTED') {
    todo = 'Nothing — this return has been accepted. No further action is required.';
    regulator = 'Nothing. This filing is closed as accepted.';
  } else if (SUBMITTED_STATES.has(String(i.versionStatus ?? i.filingStatus))) {
    todo = i.openRequests > 0
      ? 'Respond to the open request(s) from the regulator below.'
      : 'Nothing right now — your submission is with the regulator.';
    regulator = i.openRequests > 0
      ? 'Your response to the open request(s).'
      : 'Nothing. The regulator has your submission and will come back to you if anything is needed.';
  } else if (i.isReadOnly) {
    todo = 'You have read-only access. Ask a filing user in your organisation to complete and submit this return.';
    regulator = 'The completed submission for this reporting period.';
  } else if (blocking.length === 0) {
    todo = 'Validate and submit this return.';
    regulator = 'Your submission for this reporting period.';
  } else {
    todo = 'Complete the outstanding items below, validate, accept the declaration and submit.';
    regulator = 'Your submission for this reporting period.';
  }

  return { todo, complete, blocking, regulator };
}

export function FilerGuidancePanel(props: FilerGuidanceInput) {
  const g = deriveFilerGuidance(props);
  const pct = props.totalRequiredForms > 0
    ? Math.round((props.completedRequiredForms / props.totalRequiredForms) * 100)
    : 100;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Where this return stands</CardTitle>
        <div className="flex items-center gap-2">
          {props.versionNumber != null && <Badge variant="outline">v{props.versionNumber}</Badge>}
          {props.dueDate && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />Due {formatDateOnly(props.dueDate)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Block icon={<HelpCircle className="h-4 w-4 text-primary" />} title="What do I need to do?">
          <p className="text-sm">{g.todo}</p>
        </Block>

        <Block icon={<CheckCircle2 className="h-4 w-4 text-primary" />} title="What is complete?">
          <p className="text-sm">{g.complete}</p>
          <Progress value={pct} className="mt-2 h-2" />
          {props.warningIssues > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{props.warningIssues} non-blocking warning(s) noted.</p>
          )}
        </Block>

        <Block icon={<CircleAlert className="h-4 w-4 text-destructive" />} title="What is blocking submission?">
          {g.blocking.length === 0 ? (
            <p className="text-sm">Nothing is blocking submission.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {g.blocking.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </Block>

        <Block icon={<Clock className="h-4 w-4 text-primary" />} title="What is the regulator waiting for?">
          <p className="text-sm">{g.regulator}</p>
        </Block>
      </CardContent>
    </Card>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{title}
      </p>
      {children}
    </div>
  );
}
