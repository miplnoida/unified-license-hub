/**
 * Governed action bar.
 *
 * Every control is driven by `supervisory_methodology_action_capabilities` —
 * no role name, no `is_super_admin` shortcut, no status inference in the
 * browser. A refused action stays visible but disabled with the server's own
 * business reason, so an officer learns why rather than losing the control.
 * Operational activation is deliberately absent from this wave.
 */
import { useState } from 'react';
import { CheckCircle2, Building2, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import {
  useAdoptMethodologyReference,
  useMethodologyLifecycleTransition,
  useSupervisoryMethodologyValidation,
  useSupervisoryMethodologyAdoptionTargets,
  type MethodologyCapabilities,
  type MethodologyCapability,
  type MethodologyDetail,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { formatDateTime } from './labels';

function GuardedAction({
  capability,
  label,
  icon,
  variant = 'outline',
  onClick,
}: {
  capability?: MethodologyCapability;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'outline';
  onClick: () => void;
}) {
  const allowed = !!capability?.allowed;
  const button = (
    <Button size="sm" variant={variant} disabled={!allowed} aria-disabled={!allowed} onClick={allowed ? onClick : undefined} className="gap-1.5">
      {icon}
      {label}
    </Button>
  );
  if (allowed || !capability?.reason) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span tabIndex={0}>{button}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{capability.reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function errorMessage(e: unknown) {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return m.replace(/^ERROR:\s*/i, '') || 'The server refused this action.';
}

export function MethodologyActionBar({
  methodology,
  capabilities,
  isLoading,
}: {
  methodology: MethodologyDetail;
  capabilities?: MethodologyCapabilities;
  isLoading: boolean;
}) {
  const [dialog, setDialog] = useState<null | 'adopt' | 'review' | 'draft' | 'approve'>(null);
  const [rationale, setRationale] = useState('');
  const [regulatorId, setRegulatorId] = useState<string>('');

  const targets = useSupervisoryMethodologyAdoptionTargets(methodology.id, dialog === 'adopt');
  const adopt = useAdoptMethodologyReference();
  const lifecycle = useMethodologyLifecycleTransition();

  const close = () => { setDialog(null); setRationale(''); setRegulatorId(''); };

  const submitAdopt = async () => {
    try {
      await adopt.mutateAsync({ referenceId: methodology.id, regulatorId: effectiveRegulatorId, rationale });
      toast({ title: 'Adopted for regulator', description: 'A regulator-owned draft version has been created from this reference.' });
      close();
    } catch (e) {
      toast({ title: 'Adoption refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const submitLifecycle = async (to: 'REVIEW' | 'DRAFT' | 'APPROVED', successTitle: string) => {
    try {
      await lifecycle.mutateAsync({ methodologyId: methodology.id, toStatus: to, rationale });
      toast({ title: successTitle });
      close();
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const mc = capabilities?.maker_checker;
  const targetRows = targets.data?.rows ?? [];
  // One eligible regulator is context, not a question. It is resolved
  // automatically and only the rationale is asked for.
  const soleTarget = targetRows.length === 1 ? targetRows[0] : null;
  const effectiveRegulatorId = soleTarget ? soleTarget.id : regulatorId;
  const selected = targetRows.find((r) => r.id === effectiveRegulatorId);

  // Readiness summary only. The server runs the same validation inside the
  // lifecycle operation and refuses the transition itself.
  const validation = useSupervisoryMethodologyValidation(methodology.id);
  const errors = validation.data?.blocking_count ?? 0;
  const warnings = validation.data?.advisory_count ?? 0;
  const blockedReason = errors > 0
    ? `${errors} blocking methodology ${errors === 1 ? 'error' : 'errors'} must be resolved. See the Validation tab.`
    : null;

  const gate = (capability?: MethodologyCapability): MethodologyCapability | undefined => {
    if (!capability) return capability;
    if (blockedReason && capability.allowed) return { ...capability, allowed: false, reason: blockedReason };
    return capability;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? <span className="text-xs text-muted-foreground">Checking your authority…</span> : null}
        {validation.data ? (
          <Badge variant={errors ? 'destructive' : 'secondary'} className="gap-1">
            Validation: {errors} {errors === 1 ? 'error' : 'errors'}, {warnings} {warnings === 1 ? 'warning' : 'warnings'}
          </Badge>
        ) : null}
        <GuardedAction
          capability={capabilities?.can_adopt}
          label="Adopt for Regulator"
          variant={methodology.origin === 'MIPL_REFERENCE' ? 'default' : 'outline'}
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => setDialog('adopt')}
        />
        <GuardedAction
          capability={gate(capabilities?.can_submit_review)}
          label="Submit for Review"
          variant={methodology.origin !== 'MIPL_REFERENCE' && methodology.status === 'DRAFT' ? 'default' : 'outline'}
          icon={<Send className="h-4 w-4" />}
          onClick={() => setDialog('review')}
        />
        <GuardedAction
          capability={capabilities?.can_return_to_draft}
          label="Return to Draft"
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={() => setDialog('draft')}
        />
        <GuardedAction
          capability={gate(capabilities?.can_approve)}
          label="Approve Methodology"
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => setDialog('approve')}
        />
      </div>

      {/* ---------------------------------------------------- adopt dialog */}
      <Dialog open={dialog === 'adopt'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adopt for a regulator</DialogTitle>
            <DialogDescription>
              Adoption creates a regulator-owned draft version from this reference template. The reference itself stays a
              draft reference and is never approved in place.
            </DialogDescription>
          </DialogHeader>
          {targets.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading the regulators within your configuration scope…</p>
          ) : targets.error ? (
            <p className="text-sm text-destructive">{errorMessage(targets.error)}</p>
          ) : !targets.data?.rows.length ? (
            <p className="text-sm text-muted-foreground">{targets.data?.reason ?? 'No regulator is available to you for adoption.'}</p>
          ) : (
            <div className="space-y-3">
              {soleTarget ? (
                <p className="text-sm font-medium" data-testid="adopt-sole-regulator">
                  Adopt for {soleTarget.name} ({soleTarget.code})
                </p>
              ) : (
              <div className="space-y-1.5">
                <Label htmlFor="adopt-regulator">Regulator</Label>
                <Select value={regulatorId} onValueChange={setRegulatorId}>
                  <SelectTrigger id="adopt-regulator"><SelectValue placeholder="Select a regulator" /></SelectTrigger>
                  <SelectContent>
                    {targets.data.rows.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.code}){r.already_adopted ? ' — already adopted' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              {selected?.already_adopted ? (
                <p className="text-xs text-warning">This regulator already holds a version adopted from this reference.</p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Reference methodology</dt>
                  <dd className="font-mono">{methodology.code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reference version</dt>
                  <dd className="font-mono">{methodology.version}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Resulting version</dt>
                  <dd className="font-mono">{selected?.resulting_version ?? '—'}</dd>
                </div>
              </dl>
              <div className="space-y-1.5">
                <Label htmlFor="adopt-rationale">Adoption rationale</Label>
                <Textarea id="adopt-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why is this regulator adopting the reference methodology?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              onClick={submitAdopt}
              disabled={!effectiveRegulatorId || rationale.trim().length < 10 || adopt.isPending}
            >
              {adopt.isPending ? 'Adopting…' : 'Adopt for regulator'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- lifecycle dialogs */}
      <Dialog open={dialog === 'review'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for regulator review</DialogTitle>
            <DialogDescription>
              The version moves to REVIEW. A different officer holding methodology approval authority for this regulator
              must take the approval decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="review-rationale">Submission rationale</Label>
            <Textarea id="review-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={rationale.trim().length < 10 || lifecycle.isPending}
              onClick={() => submitLifecycle('REVIEW', 'Submitted for review')}>
              {lifecycle.isPending ? 'Submitting…' : 'Submit for review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'draft'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to draft</DialogTitle>
            <DialogDescription>The version returns to DRAFT for further work. The reason is recorded in the audit history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="draft-rationale">Reason</Label>
            <Textarea id="draft-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={rationale.trim().length < 10 || lifecycle.isPending}
              onClick={() => submitLifecycle('DRAFT', 'Returned to draft')}>
              {lifecycle.isPending ? 'Saving…' : 'Return to draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'approve'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve methodology</DialogTitle>
            <DialogDescription>
              This is the regulator's substantive methodology decision. It is recorded against the regulator's approval
              register and cannot be amended afterwards — record a new decision instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Prepared by</dt>
                <dd>{mc?.author_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Submitted for review by</dt>
                <dd>{mc?.submitted_by_name ?? '—'}{mc?.submitted_at ? ` · ${formatDateTime(mc.submitted_at)}` : ''}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Your eligibility</dt>
                <dd>
                  {mc?.actor_is_author ? <Badge variant="outline" className="mr-1">You prepared this version</Badge> : null}
                  {mc?.actor_is_submitter ? <Badge variant="outline" className="mr-1">You submitted it for review</Badge> : null}
                  {!mc?.actor_is_author && !mc?.actor_is_submitter ? 'Eligible as an independent approver' : null}
                </dd>
              </div>
            </dl>
            <div className="space-y-1.5">
              <Label htmlFor="approve-rationale">Approval rationale</Label>
              <Textarea id="approve-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={rationale.trim().length < 10 || lifecycle.isPending}
              onClick={() => submitLifecycle('APPROVED', 'Methodology approved')}>
              {lifecycle.isPending ? 'Recording…' : 'Record approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
