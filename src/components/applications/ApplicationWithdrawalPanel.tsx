import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { applicationWithdraw } from '@/lib/applicationGovernedOps';
import { formatDateTime } from '@/lib/datetime';

/**
 * F4-B2 — applicant withdrawal surface.
 *
 * The ONLY client entry point for applicant-initiated withdrawal. It calls the
 * governed `withdraw_application(uuid, text)` RPC and never writes
 * `public.applications` directly — ownership, eligible state, reason validation,
 * workflow cancellation, audit and notification all remain server-authoritative.
 *
 * The control is hidden unless the signed-in user is the applicant (or an
 * APPROVED member of the owning entity) AND the server-held status is a
 * non-terminal state. Terminal states (approved / rejected / cancelled /
 * withdrawn / closed) never expose the control.
 */

/** Server-terminal application states — withdrawal is never offered for these. */
export const WITHDRAWAL_TERMINAL_STATUSES = [
  'approved',
  'rejected',
  'cancelled',
  'withdrawn',
  'closed',
] as const;

const MIN_REASON_LENGTH = 5;

export function isWithdrawalEligibleStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return !(WITHDRAWAL_TERMINAL_STATUSES as readonly string[]).includes(String(status).toLowerCase());
}

interface Props {
  applicationId: string;
  applicationNumber?: string | null;
  status: string;
  applicantId: string | null;
  entityId?: string | null;
  /** Server-persisted withdrawal metadata (applications.data). */
  applicationData?: Record<string, unknown> | null;
  onWithdrawn?: () => void;
}

export function ApplicationWithdrawalPanel({
  applicationId,
  applicationNumber,
  status,
  applicantId,
  entityId,
  applicationData,
  onWithdrawn,
}: Props) {
  const { user } = useAuth();
  const [isEntityMember, setIsEntityMember] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedStatus = String(status || '').toLowerCase();
  const isApplicant = !!user?.id && !!applicantId && user.id === applicantId;

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !entityId || isApplicant) {
      setIsEntityMember(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('entity_user_memberships')
        .select('id')
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .eq('status', 'APPROVED')
        .maybeSingle();
      if (!cancelled) setIsEntityMember(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, entityId, isApplicant]);

  const isAuthorized = isApplicant || isEntityMember;

  // Final withdrawn state — shown to anyone who can read the application.
  if (normalizedStatus === 'withdrawn') {
    const withdrawnAt = applicationData?.['withdrawn_at'] as string | undefined;
    const withdrawalReason = applicationData?.['withdrawal_reason'] as string | undefined;
    return (
      <Card className="border-destructive/40 bg-destructive/5" data-testid="application-withdrawn-state">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Ban className="h-4 w-4" />
            Application Withdrawn
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            This application has been withdrawn and is closed to further action.
          </p>
          {withdrawnAt && (
            <p>
              <span className="text-muted-foreground">Withdrawn: </span>
              {formatDateTime(withdrawnAt)}
            </p>
          )}
          {withdrawalReason && (
            <p>
              <span className="text-muted-foreground">Reason: </span>
              {withdrawalReason}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!isAuthorized || !isWithdrawalEligibleStatus(normalizedStatus)) return null;

  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH;

  const handleWithdraw = async () => {
    if (!reasonValid) {
      toast.error(`Please provide a withdrawal reason (at least ${MIN_REASON_LENGTH} characters).`);
      return;
    }
    setSubmitting(true);
    try {
      await applicationWithdraw(applicationId, reason.trim());
      toast.success(`Application ${applicationNumber || ''} withdrawn`.trim());
      setReason('');
      setConfirmOpen(false);
      onWithdrawn?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Withdrawal failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card data-testid="application-withdrawal-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Ban className="h-4 w-4 text-destructive" />
          Withdraw Application
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Withdrawing stops the review of this application. The regulator records the withdrawal and
          the reason you provide. This cannot be undone.
        </p>
        <div className="space-y-2">
          <Label htmlFor="withdrawal-reason" className="text-sm">
            Reason for withdrawal <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="withdrawal-reason"
            data-testid="withdrawal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are withdrawing this application..."
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="destructive"
            /* Ownership is authorised server-side by withdraw_application; the
               annotation records the governed module/action for the RBAC audit. */
            data-rbac="application_management.edit"
            data-testid="withdraw-application-button"
            disabled={submitting || !reasonValid}
            onClick={() => setConfirmOpen(true)}
          >

            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
            Withdraw Application
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this application?</AlertDialogTitle>
            <AlertDialogDescription>
              Application {applicationNumber || applicationId} will be withdrawn and its review
              stopped. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep application</AlertDialogCancel>
            <AlertDialogAction
              data-testid="withdraw-application-confirm"
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                void handleWithdraw();
              }}
            >
              Confirm withdrawal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default ApplicationWithdrawalPanel;
