/**
 * Governed policy-profile action bar.
 *
 * Every control is driven by `supervisory_policy_profile_action_capabilities`.
 * The browser never infers authority from a role name or a status string: a
 * refused action stays visible but disabled, carrying the server's own business
 * reason so the officer learns why.
 */
import { useState } from 'react';
import { Building2, CheckCircle2, CopyPlus, PlayCircle, RotateCcw, Send, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import {
  useAdoptPolicyProfileReference,
  useNewPolicyProfileVersion,
  usePolicyProfileLifecycleTransition,
  useSupervisoryPolicyProfileOptions,
  type PolicyCapability,
  type PolicyProfileCapabilities,
  type PolicyProfileDetail,
} from '@/hooks/useSupervisoryPolicyProfiles';
import { errorMessage, formatDateTime } from './labels';

function GuardedAction({
  capability, label, icon, variant = 'outline', onClick,
}: {
  capability?: PolicyCapability;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'outline';
  onClick: () => void;
}) {
  const allowed = !!capability?.allowed;
  const button = (
    <Button size="sm" variant={variant} disabled={!allowed} aria-disabled={!allowed}
      onClick={allowed ? onClick : undefined} className="gap-1.5">
      {icon}{label}
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

type DialogKind = null | 'adopt' | 'review' | 'draft' | 'approve' | 'activate' | 'retire' | 'version';

export function PolicyProfileActionBar({
  profile, capabilities, isLoading, onNavigate,
}: {
  profile: PolicyProfileDetail;
  capabilities?: PolicyProfileCapabilities;
  isLoading: boolean;
  onNavigate: (profileId: string) => void;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [rationale, setRationale] = useState('');
  const [regulatorId, setRegulatorId] = useState('');
  const [newVersion, setNewVersion] = useState('');

  const options = useSupervisoryPolicyProfileOptions();
  const adopt = useAdoptPolicyProfileReference();
  const newVer = useNewPolicyProfileVersion();
  const lifecycle = usePolicyProfileLifecycleTransition();

  const close = () => { setDialog(null); setRationale(''); setRegulatorId(''); setNewVersion(''); };
  const shortRationale = rationale.trim().length < 10;

  const submitAdopt = async () => {
    try {
      const id = await adopt.mutateAsync({ referenceId: profile.id, regulatorId, rationale });
      toast({ title: 'Adopted for regulator', description: 'A regulator-owned draft profile has been created from this reference.' });
      close();
      if (id) onNavigate(id);
    } catch (e) {
      toast({ title: 'Adoption refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const submitNewVersion = async () => {
    try {
      const id = await newVer.mutateAsync({ profileId: profile.id, newVersion: newVersion.trim(), rationale });
      toast({ title: 'New version created', description: 'Bindings and component requirements were copied into the new draft.' });
      close();
      if (id) onNavigate(id);
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const submitLifecycle = async (to: string, successTitle: string) => {
    try {
      const result = await lifecycle.mutateAsync({ profileId: profile.id, toStatus: to, rationale });
      const superseded = result?.superseded_profiles ?? 0;
      toast({
        title: successTitle,
        description: superseded > 0
          ? `${superseded} previously active profile${superseded === 1 ? '' : 's'} superseded.`
          : undefined,
      });
      close();
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const mc = capabilities?.maker_checker;
  const regulators = options.data?.regulators ?? [];
  const blockers = profile.readiness?.blockers ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? <span className="text-xs text-muted-foreground">Checking your authority…</span> : null}
        <GuardedAction capability={capabilities?.can_adopt} label="Adopt for Regulator"
          variant={profile.origin === 'MIPL_REFERENCE' ? 'default' : 'outline'}
          icon={<Building2 className="h-4 w-4" />} onClick={() => setDialog('adopt')} />
        <GuardedAction capability={capabilities?.can_submit_review} label="Submit for Review"
          variant={profile.status === 'DRAFT' && profile.origin !== 'MIPL_REFERENCE' ? 'default' : 'outline'}
          icon={<Send className="h-4 w-4" />} onClick={() => setDialog('review')} />
        <GuardedAction capability={capabilities?.can_return_to_draft} label="Return to Draft"
          icon={<RotateCcw className="h-4 w-4" />} onClick={() => setDialog('draft')} />
        <GuardedAction capability={capabilities?.can_approve} label="Approve Profile"
          variant={profile.status === 'REVIEW' ? 'default' : 'outline'}
          icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDialog('approve')} />
        <GuardedAction capability={capabilities?.can_activate} label="Activate"
          variant={profile.status === 'APPROVED' ? 'default' : 'outline'}
          icon={<PlayCircle className="h-4 w-4" />} onClick={() => setDialog('activate')} />
        <GuardedAction capability={capabilities?.can_new_version} label="New Version"
          icon={<CopyPlus className="h-4 w-4" />} onClick={() => setDialog('version')} />
        <GuardedAction capability={capabilities?.can_retire} label="Retire"
          icon={<Archive className="h-4 w-4" />} onClick={() => setDialog('retire')} />
      </div>

      {/* ------------------------------------------------------- adoption */}
      <Dialog open={dialog === 'adopt'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adopt this policy profile for a regulator</DialogTitle>
            <DialogDescription>
              Adoption creates a regulator-owned draft profile carrying the same component bindings. The MIPL reference
              itself is never approved or activated in place.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-adopt-regulator">Regulator</Label>
              <Select value={regulatorId} onValueChange={setRegulatorId}>
                <SelectTrigger id="pp-adopt-regulator"><SelectValue placeholder="Select a regulator" /></SelectTrigger>
                <SelectContent>
                  {regulators.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-adopt-rationale">Adoption rationale</Label>
              <Textarea id="pp-adopt-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)}
                placeholder="Why is this regulator adopting this policy profile?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submitAdopt} disabled={!regulatorId || shortRationale || adopt.isPending}>
              {adopt.isPending ? 'Adopting…' : 'Adopt for regulator'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- new version */}
      <Dialog open={dialog === 'version'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new profile version</DialogTitle>
            <DialogDescription>
              The current component bindings and requirements are copied into a new draft version. Approved and active
              versions are never edited in place.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-new-version">New version label</Label>
              <Input id="pp-new-version" value={newVersion} onChange={(e) => setNewVersion(e.target.value)}
                placeholder={`e.g. ${profile.profile_version}.1`} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-version-rationale">Reason for the new version</Label>
              <Textarea id="pp-version-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submitNewVersion} disabled={!newVersion.trim() || shortRationale || newVer.isPending}>
              {newVer.isPending ? 'Creating…' : 'Create version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------- lifecycle */}
      <Dialog open={dialog === 'review'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for regulator review</DialogTitle>
            <DialogDescription>
              The profile moves to review. A different officer holding policy approval authority for this regulator must
              take the approval decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-review-rationale">Submission rationale</Label>
            <Textarea id="pp-review-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={shortRationale || lifecycle.isPending}
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
            <DialogDescription>The profile returns to draft for further work. The reason is recorded in its history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-draft-rationale">Reason</Label>
            <Textarea id="pp-draft-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={shortRationale || lifecycle.isPending}
              onClick={() => submitLifecycle('DRAFT', 'Returned to draft')}>
              {lifecycle.isPending ? 'Saving…' : 'Return to draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'approve'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this policy profile</DialogTitle>
            <DialogDescription>
              This is the regulator's substantive configuration decision. Once approved the profile's components cannot be
              changed — issue a new version instead.
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
            {blockers.length ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">Required components are not satisfied</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                  {blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="pp-approve-rationale">Approval rationale</Label>
              <Textarea id="pp-approve-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={shortRationale || lifecycle.isPending}
              onClick={() => submitLifecycle('APPROVED', 'Policy profile approved')}>
              {lifecycle.isPending ? 'Recording…' : 'Record approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'activate'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate this policy profile</DialogTitle>
            <DialogDescription>
              Activation makes this the regulator's current configuration for the domain and supersedes the profile it
              replaces. In this release, policy profiles govern configuration only — existing assessments continue to run
              on their own methodology version.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-activate-rationale">Activation rationale</Label>
            <Textarea id="pp-activate-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={shortRationale || lifecycle.isPending}
              onClick={() => submitLifecycle('ACTIVE', 'Policy profile activated')}>
              {lifecycle.isPending ? 'Activating…' : 'Activate profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'retire'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire this policy profile</DialogTitle>
            <DialogDescription>
              The profile stops being available as the regulator's configuration. Its history is preserved in full.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-retire-rationale">Reason for retirement</Label>
            <Textarea id="pp-retire-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button variant="destructive" disabled={shortRationale || lifecycle.isPending}
              onClick={() => submitLifecycle('RETIRED', 'Policy profile retired')}>
              {lifecycle.isPending ? 'Retiring…' : 'Retire profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
