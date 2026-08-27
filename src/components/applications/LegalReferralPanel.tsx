/**
 * Legal / specialist referral lifecycle panel (FRD 6.3).
 *
 * Case owners refer an application to legal/compliance/specialist review with a
 * reason, assignee and due date. The specialist accepts (in_review), records an
 * opinion (append-only legal note), then returns the referral; the case owner
 * completes it. Every referral and opinion stays visible as history.
 */
import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmployeeCombobox } from '@/components/entity-detail/EmployeeCombobox';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { Scale, Loader2, Clock, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLegalReferrals,
  useCreateLegalReferral,
  useUpdateLegalReferral,
  type LegalReferral,
  type ReferralSpecialism,
  type ReferralStatus,
} from '@/hooks/useApplicationLegalReferrals';
import { useLegalNotes } from '@/hooks/useApplicationLegalNotes';

interface Props {
  applicationId: string;
  workflowInstanceId: string | null;
  currentStepId: string | null;
  /** Case owner / reviewer able to raise and complete referrals. */
  canRefer: boolean;
  /** Legal or specialist reviewer able to accept and return referrals. */
  isLegalReviewer: boolean;
  currentUserId: string | null;
}

const SPECIALISM_LABELS: Record<ReferralSpecialism, string> = {
  legal: 'Legal',
  compliance: 'Compliance',
  aml: 'AML / CFT',
  actuarial: 'Actuarial',
  it_risk: 'IT & cyber risk',
  other: 'Other specialist',
};

const STATUS_VARIANT: Record<ReferralStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  referred: 'outline',
  in_review: 'secondary',
  returned: 'default',
  completed: 'default',
  cancelled: 'destructive',
};

const STATUS_LABELS: Record<ReferralStatus, string> = {
  referred: 'Awaiting specialist',
  in_review: 'Under specialist review',
  returned: 'Opinion returned',
  completed: 'Closed',
  cancelled: 'Cancelled',
};

export function LegalReferralPanel({
  applicationId,
  workflowInstanceId,
  currentStepId,
  canRefer,
  isLegalReviewer,
  currentUserId,
}: Props) {
  const { data: referrals = [], isLoading } = useLegalReferrals(applicationId, canRefer || isLegalReviewer);
  const { data: notes = [] } = useLegalNotes(applicationId, canRefer || isLegalReviewer);
  const { data: internalUsers = [] } = useInternalUsers();
  const createReferral = useCreateLegalReferral(applicationId);
  const updateReferral = useUpdateLegalReferral(applicationId);

  const [open, setOpen] = useState(false);
  const [specialism, setSpecialism] = useState<ReferralSpecialism>('legal');
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [completing, setCompleting] = useState<LegalReferral | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  const employeeOptions = useMemo(
    () =>
      internalUsers.map((u: any) => ({
        id: u.id,
        label: u.full_name || u.email || u.id,
        sublabel: u.full_name && u.email ? u.email : null,
        inactive: !u.is_active,
      })),
    [internalUsers],
  );
  const staffName = (id: string | null) =>
    (id && employeeOptions.find((o) => o.id === id)?.label) || (id ? `${id.slice(0, 8)}…` : '—');

  const opinionsFor = (referralId: string) => notes.filter((n: any) => n.referral_id === referralId);

  if (!canRefer && !isLegalReviewer) return null;

  const submitReferral = () => {
    if (reason.trim().length < 10) {
      toast.error('Please give a referral reason of at least 10 characters.');
      return;
    }
    createReferral.mutate(
      {
        specialism,
        referral_reason: reason.trim(),
        referred_to: assignee,
        due_at: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        workflow_instance_id: workflowInstanceId,
        step_id: currentStepId,
      },
      {
        onSuccess: () => {
          toast.success('Referral raised');
          setOpen(false);
          setReason('');
          setAssignee(null);
          setDueDate('');
          setSpecialism('legal');
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const transition = (referral: LegalReferral, status: ReferralStatus, notesText?: string) => {
    updateReferral.mutate(
      { id: referral.id, status, completion_notes: notesText ?? undefined },
      {
        onSuccess: () => {
          toast.success(`Referral ${STATUS_LABELS[status].toLowerCase()}`);
          setCompleting(null);
          setCompletionNotes('');
        },
        onError: (e: unknown) => {
          const msg = (e as Error).message || '';
          if (msg.includes('LEGAL_REFERRAL_OPINION_REQUIRED')) {
            toast.error('Record a legal opinion for this referral before returning it to the case owner.');
          } else if (msg.includes('LEGAL_REFERRAL_INVALID_TRANSITION')) {
            toast.error('That referral status change is not allowed.');
          } else {
            toast.error(msg);
          }
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" /> Legal &amp; specialist referrals
        </CardTitle>
        {canRefer && (
          <GuardedButton module="application_management" action="workflow_action" data-rbac="application_management.workflow_action" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Refer for review
          </GuardedButton>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading referrals…
          </div>
        ) : referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No referrals raised for this application.</p>
        ) : (
          referrals.map((r) => {
            const overdue =
              !!r.due_at && ['referred', 'in_review'].includes(r.status) && new Date(r.due_at) < new Date();
            const opinions = opinionsFor(r.id);
            const isAssignee = !!currentUserId && r.referred_to === currentUserId;
            return (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{SPECIALISM_LABELS[r.specialism]}</Badge>
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  {overdue && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    Raised {new Date(r.requested_at).toLocaleString()} by {staffName(r.referred_by)}
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap">{r.referral_reason}</p>

                <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
                  <span>Assigned to: {staffName(r.referred_to)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due: {r.due_at ? new Date(r.due_at).toLocaleDateString() : 'Not set'}
                  </span>
                  <span>Opinions recorded: {opinions.length}</span>
                </div>

                {r.returned_at && (
                  <p className="text-xs text-muted-foreground">
                    Returned {new Date(r.returned_at).toLocaleString()} by {staffName(r.returned_by)}
                  </p>
                )}
                {r.completion_notes && (
                  <p className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap">{r.completion_notes}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(isLegalReviewer || isAssignee) && r.status === 'referred' && (
                    <GuardedButton module="application_management" action="approve" data-rbac="application_management.approve" size="sm" variant="outline" disabled={updateReferral.isPending} onClick={() => transition(r, 'in_review')}>
                      Accept review
                    </GuardedButton>
                  )}
                  {(isLegalReviewer || isAssignee) && r.status === 'in_review' && (
                    <Button data-rbac="application_management.edit" size="sm" disabled={updateReferral.isPending} onClick={() => transition(r, 'returned')}>
                      Return opinion to case
                    </Button>
                  )}
                  {canRefer && r.status === 'returned' && (
                    <GuardedButton module="application_management" action="edit" data-rbac="application_management.edit" size="sm" variant="outline" disabled={updateReferral.isPending} onClick={() => setCompleting(r)}>
                      Close referral
                    </GuardedButton>
                  )}
                  {canRefer && ['referred', 'in_review'].includes(r.status) && (
                    <Button size="sm" variant="ghost" disabled={updateReferral.isPending} onClick={() => transition(r, 'cancelled')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <p className="text-xs text-muted-foreground">
          Opinions are recorded as append-only legal notes below and cannot be edited or removed, so referral history is
          preserved for audit.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refer for legal / specialist review</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Specialism</Label>
              <Select value={specialism} onValueChange={(v) => setSpecialism(v as ReferralSpecialism)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SPECIALISM_LABELS) as ReferralSpecialism[]).map((k) => (
                    <SelectItem key={k} value={k}>{SPECIALISM_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason for referral</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Describe the legal or specialist question to be answered…"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Assign to</Label>
                <EmployeeCombobox value={assignee} options={employeeOptions} onChange={setAssignee} placeholder="Unassigned" />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-rbac="application_management.edit" onClick={submitReferral} disabled={createReferral.isPending}>
              {createReferral.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Raise referral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close referral</DialogTitle></DialogHeader>
          <div>
            <Label>Closure note (optional)</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="How the opinion was taken into account…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
            <GuardedButton module="application_management" action="edit" data-rbac="application_management.edit"
              onClick={() => completing && transition(completing, 'completed', completionNotes.trim() || null)}
              disabled={updateReferral.isPending}
            >
              {updateReferral.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Close referral
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
