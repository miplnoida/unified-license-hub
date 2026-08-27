import { useEffect, useRef, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gavel, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';

import { useApplicationAppeals, useLicenseAppealMutations } from '@/hooks/useLicenseAppeals';
import {
  APPEAL_WINDOW_DAYS, appealDeadlineFor, appealDecisionMeta, appealStatusMeta,
  daysRemaining, formatAppealDate, isAppealOpen,
} from '@/lib/licenseAppeals';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';
import { LodgeAppealDialog } from '@/components/appeals/LodgeAppealDialog';

interface Props {
  applicationId: string;
  applicationNumber: string;
  rejectedAt?: string | null;
  licenseeId?: string | null;
  regulatorId?: string | null;
  /** Only the applicant who owns the application may lodge an appeal. */
  canLodge: boolean;
}

/**
 * Applicant-facing appeal panel shown on a refused application: countdown to the
 * statutory deadline, lodging dialog, and live status of any appeal already filed.
 */
export function LicenseAppealPanel({
  applicationId, applicationNumber, rejectedAt, licenseeId, regulatorId, canLodge,
}: Props) {
  const { data: appeals, isLoading } = useApplicationAppeals(applicationId);
  const { withdrawAppeal } = useLicenseAppealMutations();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(false);

  // Deep link from the applications list: /applications/:id#appeal
  useEffect(() => {
    if (window.location.hash !== '#appeal') return;
    const t = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 2500);
    }, 300);
    return () => window.clearTimeout(t);
  }, []);

  const deadline = appealDeadlineFor(rejectedAt);
  const remaining = daysRemaining(deadline);
  const windowClosed = remaining !== null && remaining < 0;
  const existing = appeals?.[0] ?? null;

  const withdraw = async () => {
    if (!existing) return;
    const confirm = await Swal.fire({
      title: 'Withdraw this appeal?',
      html: `<p>Appeal <b>${existing.appeal_reference}</b> will be withdrawn and the regulator will stop reviewing it.<br/>This action cannot be undone.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, withdraw',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm.isConfirmed) return;
    try {
      await withdrawAppeal.mutateAsync(existing.id);
      toast.success('Appeal withdrawn');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to withdraw appeal');
    }
  };


  const statusMeta = existing ? appealStatusMeta(existing.status) : null;
  const decisionMeta = appealDecisionMeta(existing?.decision);

  return (
    <Card
      id="appeal"
      ref={cardRef}
      className={`border-amber-200 transition-shadow ${highlight ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-amber-600" />
          Appeal this decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking appeal status…
          </div>
        ) : existing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium">{existing.appeal_reference}</span>
              <Badge className={statusMeta!.className} variant="outline">{statusMeta!.label}</Badge>
              {decisionMeta && <Badge className={decisionMeta.className} variant="outline">{decisionMeta.label}</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Lodged on</p>
                <p>{formatAppealDate(existing.filed_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hearing date</p>
                <p>{formatAppealDate(existing.hearing_date)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Your grounds of appeal</p>
                <p className="whitespace-pre-wrap">{existing.grounds}</p>
              </div>
              {existing.decision_rationale && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Decision rationale</p>
                  <p className="whitespace-pre-wrap">{existing.decision_rationale}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Appeal history</p>
              <AppealTimeline appealId={existing.id} />
            </div>
            {canLodge && isAppealOpen(existing.status) && (
              <GuardedButton module="license_appeals" action="edit" data-rbac="license_appeals.edit" variant="outline" size="sm" onClick={withdraw} disabled={withdrawAppeal.isPending}>
                {withdrawAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Withdraw appeal
              </GuardedButton>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              If you believe this refusal was incorrect, you may lodge an appeal within{' '}
              {APPEAL_WINDOW_DAYS} days of the decision.
            </p>
            {deadline && (
              <div className={`flex items-center gap-2 text-sm ${windowClosed ? 'text-destructive' : 'text-amber-700'}`}>
                <AlertTriangle className="h-4 w-4" />
                {windowClosed
                  ? `The appeal window closed on ${formatAppealDate(deadline.toISOString())}.`
                  : `${remaining} day${remaining === 1 ? '' : 's'} left — deadline ${formatAppealDate(deadline.toISOString())}.`}
              </div>
            )}
            {canLodge && (
              <Button size="sm" onClick={() => setOpen(true)} disabled={windowClosed}>
                <Gavel className="h-4 w-4 mr-2" />
                Lodge an appeal
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <LodgeAppealDialog
        open={open}
        onOpenChange={setOpen}
        applicationId={applicationId}
        applicationNumber={applicationNumber}
        licenseeId={licenseeId}
        regulatorId={regulatorId}
        deadline={deadline}
      />
    </Card>
  );
}
