import { useState } from 'react';
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
  LicenseAppeal, useAppealApplicationStatus, useLicenseAppealMutations,
} from '@/hooks/useLicenseAppeals';
import {
  appealDecisionMeta, appealStatusMeta, formatAppealDate, isAppealOpen,
} from '@/lib/licenseAppeals';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';
import { useCan } from '@/hooks/useCan';

interface Props {
  appeal: LicenseAppeal | null;
  onOpenChange: (open: boolean) => void;
}

/** Regulator-side appeal record: a single decision — consider the appeal, or decline it. */
export function AppealActionsDialog({ appeal, onOpenChange }: Props) {
  const { recordDecision, reinstateApplication } = useLicenseAppealMutations();
  const canDecide = useCan('license_appeals', 'decide');
  const { data: application } = useAppealApplicationStatus(appeal?.application_id);

  const [remarks, setRemarks] = useState('');

  if (!appeal) return null;
  const statusMeta = appealStatusMeta(appeal.status);
  const decisionMeta = appealDecisionMeta(appeal.decision);
  const open = isAppealOpen(appeal.status);
  const remarksReady = remarks.trim().length >= 10;
  const needsReopen =
    appeal.decision === 'upheld' && application?.status === 'rejected' && canDecide;

  const decide = async (decision: 'upheld' | 'dismissed') => {
    if (!remarksReady) { toast.error('Add a short reason (at least 10 characters) before deciding'); return; }
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
      const result = await recordDecision.mutateAsync({ appeal, decision, rationale: remarks.trim() });
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
      setRemarks('');
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
    <Dialog open={!!appeal} onOpenChange={onOpenChange}>
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
            {appeal.decision_rationale && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Reason recorded</p>
                <p className="whitespace-pre-wrap">{appeal.decision_rationale}</p>
              </div>
            )}
          </div>

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
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => decide('upheld')}
                    disabled={!remarksReady || recordDecision.isPending}
                  >
                    {recordDecision.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Consider appeal
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => decide('dismissed')}
                    disabled={!remarksReady || recordDecision.isPending}
                  >
                    {recordDecision.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <XCircle className="h-4 w-4 mr-2" />}
                    Decline appeal
                  </Button>
                </div>
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
