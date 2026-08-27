import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  LicenseAppeal, useAppealApplicationStatus, useAppealPanelSnapshot,
  useLicenseAppeal, useLicenseAppealMutations,
} from '@/hooks/useLicenseAppeals';
import {
  appealDecisionMeta, appealStatusMeta, formatAppealDate, isAppealOpen,
} from '@/lib/licenseAppeals';
import { formatDateTime } from '@/lib/datetime';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';
import { AppealPanelSection } from '@/components/appeals/AppealPanelSection';
import { useCan } from '@/hooks/useCan';

interface Props {
  appeal: LicenseAppeal | null;
  onOpenChange: (open: boolean) => void;
}

/** Regulator-side appeal record: a single decision — consider the appeal, or decline it. */
export function AppealActionsDialog({ appeal: selectedAppeal, onOpenChange }: Props) {
  const { recordDecision, reinstateApplication, acknowledgeAppeal } = useLicenseAppealMutations();
  const canDecide = useCan('license_appeals', 'decide');
  const canAssign = useCan('license_appeals', 'assign_panel');
  // Always render from the live record so mutations (acknowledge, refer, decide)
  // update this dialog immediately instead of showing the row snapshot.
  const { data: liveAppeal } = useLicenseAppeal(selectedAppeal?.id);
  const appeal = liveAppeal ?? selectedAppeal;
  const { data: application } = useAppealApplicationStatus(appeal?.application_id);
  const { data: snapshot } = useAppealPanelSnapshot(appeal?.id);

  const [remarks, setRemarks] = useState('');
  const [dissent, setDissent] = useState('');
  const [conditions, setConditions] = useState('');

  if (!appeal) return null;

  const statusMeta = appealStatusMeta(appeal.status);
  const decisionMeta = appealDecisionMeta(appeal.decision);
  const open = isAppealOpen(appeal.status);
  const remarksReady = remarks.trim().length >= 10;
  const votingMembers = (snapshot?.member_roster || []).filter((m) => m.is_voting).length;
  const quorumMet = !!snapshot && votingMembers >= snapshot.quorum;
  const needsReopen =
    appeal.decision === 'upheld' && application?.status === 'rejected' && canDecide;

  const decide = async (decision: 'upheld' | 'dismissed') => {
    if (!remarksReady) { toast.error('Add a short reason (at least 10 characters) before deciding'); return; }
    if (!snapshot) { toast.error('Refer the appeal to a panel before recording a decision'); return; }
    if (!quorumMet) {
      toast.error(`Quorum is not met: ${votingMembers} voting member(s) against a quorum of ${snapshot.quorum}`);
      return;
    }
    const considering = decision === 'upheld';
    const confirm = await Swal.fire({
      title: considering ? 'Consider this appeal?' : 'Decline this appeal?',
      text: considering
        ? 'The refused application will be reopened and put back under review at the stage where it was refused, and the applicant will be notified.'
        : 'The appeal will be recorded as declined and the applicant notified. The application stays refused.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: considering ? 'Yes, consider it' : 'Yes, decline it',
      cancelButtonText: 'Cancel',
    });
    if (!confirm.isConfirmed) return;
    try {
      const result = await recordDecision.mutateAsync({
        appeal, decision, rationale: remarks.trim(),
        dissent: dissent.trim() || null,
        conditions: conditions.trim() || null,
      });
      if (!considering) {
        toast.success('Appeal declined');
      } else if (result?.success && !result.skipped) {
        toast.success(
          `Appeal considered — application ${result.application_number ?? ''} is back under review`.trim(),
        );
      } else {
        toast.warning(
          result?.reason
            ? `Appeal considered, but the application was not reopened: ${result.reason}`
            : 'Appeal considered, but the application was not reopened. Use “Reopen application” to retry.',
        );
      }
      setRemarks(''); setDissent(''); setConditions('');
    } catch (e: unknown) {

      toast.error((e as Error)?.message || 'Failed to record the decision');
    }
  };

  const reopen = async () => {
    try {
      const result = await reinstateApplication.mutateAsync({ appeal });
      if (result?.success && !result.skipped) {
        toast.success(
          `Application ${result.application_number ?? ''} is back under review`.trim(),
        );
      } else {
        toast.warning(result?.reason || 'The application could not be reopened.');
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to reopen the application');
    }
  };

  return (
    <Dialog open={!!selectedAppeal} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{appeal.appeal_reference}</span>
            <Badge className={statusMeta.className} variant="outline">{statusMeta.label}</Badge>
            {decisionMeta && <Badge className={decisionMeta.className} variant="outline">{decisionMeta.label}</Badge>}
          </DialogTitle>
          <DialogDescription>Review the appeal and decide whether it will be considered.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Lodged on</p><p>{formatAppealDate(appeal.filed_at)}</p></div>
            <div><p className="text-xs text-muted-foreground">Appeal deadline</p><p>{formatAppealDate(appeal.appeal_deadline)}</p></div>
            <div><p className="text-xs text-muted-foreground">Decided on</p><p>{formatAppealDate(appeal.decided_at)}</p></div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Grounds of appeal</p>
              <p className="whitespace-pre-wrap">{appeal.grounds}</p>
            </div>
            {appeal.relief_sought && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Relief sought</p>
                <p className="whitespace-pre-wrap">{appeal.relief_sought}</p>
              </div>
            )}
            {appeal.dissent_note && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Dissenting view</p>
                <p className="whitespace-pre-wrap">{appeal.dissent_note}</p>
              </div>
            )}
            {appeal.decision_conditions && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Conditions / directions</p>
                <p className="whitespace-pre-wrap">{appeal.decision_conditions}</p>
              </div>
            )}
            {appeal.decision_rationale && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Reason recorded</p>
                <p className="whitespace-pre-wrap">{appeal.decision_rationale}</p>
              </div>
            )}
          </div>

          {appeal.acknowledged_at ? (
            <>
              <Separator />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Acknowledged on {formatDateTime(appeal.acknowledged_at)}
              </p>
            </>
          ) : (canDecide || canAssign) && (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <p className="text-sm">
                  This appeal has not been acknowledged yet. Acknowledge it to accept it for review.
                </p>
                <Button data-rbac="license_appeals.edit"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (appeal.acknowledged_at || acknowledgeAppeal.isPending) return;
                    try {
                      await acknowledgeAppeal.mutateAsync(appeal);
                      toast.success('Appeal acknowledged');
                    } catch (e: unknown) {
                      toast.error((e as Error)?.message || 'Failed to acknowledge the appeal');
                    }
                  }}
                  disabled={acknowledgeAppeal.isPending}
                >
                  {acknowledgeAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Acknowledge appeal
                </Button>
              </div>
            </>
          )}


          <Separator />
          <AppealPanelSection appeal={appeal} />

          {open && canDecide && (
            <>
              <Separator />
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">Decide on this appeal</p>
                <div>
                  <Label className="text-xs">Reason / remarks</Label>
                  <Textarea
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Explain briefly why the appeal is being considered or declined…"
                  />
                </div>
                <div>
                  <Label className="text-xs">Dissenting view (optional)</Label>
                  <Textarea
                    rows={2}
                    value={dissent}
                    onChange={(e) => setDissent(e.target.value)}
                    placeholder="Record any minority or dissenting view of the panel…"
                  />
                </div>
                <div>
                  <Label className="text-xs">Conditions / directions (optional)</Label>
                  <Textarea
                    rows={2}
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    placeholder="Any conditions or directions attached to the outcome…"
                  />
                </div>
                {!quorumMet && (
                  <p className="text-xs text-muted-foreground">
                    {snapshot
                      ? `Quorum is not met (${votingMembers} of ${snapshot.quorum} voting members) — a decision cannot be recorded.`
                      : 'Refer the appeal to a panel before a decision can be recorded.'}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button data-rbac="license_appeals.edit"
                    size="sm"
                    onClick={() => decide('upheld')}
                    disabled={!remarksReady || !quorumMet || recordDecision.isPending}
                  >
                    {recordDecision.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Consider appeal
                  </Button>
                  <GuardedButton module="license_appeals" action="decide" data-rbac="license_appeals.decide"
                    size="sm"
                    variant="destructive"
                    onClick={() => decide('dismissed')}
                    disabled={!remarksReady || !quorumMet || recordDecision.isPending}
                  >
                    {recordDecision.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <XCircle className="h-4 w-4 mr-2" />}
                    Decline appeal
                  </GuardedButton>
                </div>
              </div>
            </>
          )}

          {needsReopen && (
            <>
              <Separator />
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Application is still refused
                </p>
                <p className="text-sm text-muted-foreground">
                  This appeal was accepted, but application {application?.application_number} was not
                  put back under review. Reopen it now to complete the decision.
                </p>
                <GuardedButton module="license_appeals" action="edit" data-rbac="license_appeals.edit" size="sm" onClick={reopen} disabled={reinstateApplication.isPending}>
                  {reinstateApplication.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reopen application
                </GuardedButton>
              </div>
            </>
          )}



          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">Appeal history</p>
            <AppealTimeline appealId={appeal.id} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
