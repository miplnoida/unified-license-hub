import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useAppealIndependenceMutation, useAppealIndependencePolicies, useAppealPanelMutations,
  useAppealPanelsWithMembers, useFpCommitteeMutations, useFpCommittees, useRegulators, useStaffDirectory,
} from '@/hooks/useOperatingStructure';
import { act } from './shared';

const PANEL_ROLES = [
  { value: 'chair', label: 'Chair' },
  { value: 'member', label: 'Member' },
  { value: 'legal_adviser', label: 'Legal adviser' },
  { value: 'observer', label: 'Observer' },
];

const COMMITTEE_ROLES = [
  { value: 'chair', label: 'Chair' },
  { value: 'member', label: 'Member' },
  { value: 'adviser', label: 'Adviser' },
  { value: 'observer', label: 'Observer' },
];

const UNSET = 'unset';

/**
 * Appeal Panels and Fit & Proper Committees — two distinct data models shown
 * side by side, never merged. Composition writes stay in the existing panel
 * administration screens; policy writes here use the governed
 * `appeal_independence_policy_set` routine.
 */
export function PanelsCommitteesTab() {
  const { data: panelData } = useAppealPanelsWithMembers();
  const { data: committeeData } = useFpCommittees();
  const regulators = useRegulators();
  const staff = useStaffDirectory();
  const policies = useAppealIndependencePolicies();
  const setPolicy = useAppealIndependenceMutation();

  const [scope, setScope] = useState('licensing');
  const [prior, setPrior] = useState(UNSET);
  const [adviser, setAdviser] = useState(UNSET);
  const [notes, setNotes] = useState('');

  const panelMut = useAppealPanelMutations();
  const committeeMut = useFpCommitteeMutations();
  const [memberDialog, setMemberDialog] = useState<
    { open: boolean; kind: 'panel' | 'committee'; id: string; name: string } | null
  >(null);
  const [newMember, setNewMember] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newVoting, setNewVoting] = useState('yes');
  const [ruleDialog, setRuleDialog] = useState<
    { id: string; name: string; quorum: string; pct: string } | null
  >(null);

  const currentRoster = () => {
    if (!memberDialog) return [] as any[];
    if (memberDialog.kind === 'panel')
      return (panelData?.members || []).filter((m: any) => m.panel_id === memberDialog.id && m.is_active);
    return (committeeData?.members || []).filter((m: any) => m.committee_id === memberDialog.id && m.is_active);
  };

  const addMember = async () => {
    if (!memberDialog || !newMember) return;
    const ok =
      memberDialog.kind === 'panel'
        ? await act(
            () => panelMut.addMember.mutateAsync({
              panelId: memberDialog.id,
              userId: newMember,
              memberRole: newRole,
              isVoting: newVoting === 'yes',
            }),
            'Member added to the panel',
          )
        : await act(
            () => committeeMut.addMember.mutateAsync({
              committeeId: memberDialog.id,
              userId: newMember,
              memberRole: newRole,
            }),
            'Member added to the committee',
          );
    if (ok) setNewMember('');
  };

  const removeMember = (kind: 'panel' | 'committee', memberId: string) =>
    kind === 'panel'
      ? act(() => panelMut.endMember.mutateAsync({ memberId }), 'Member removed')
      : act(() => committeeMut.setMemberActive.mutateAsync({ memberId, isActive: false }), 'Member removed');


  const staffName = (id: string) => (staff.data || []).find((s) => s.id === id)?.full_name || id.slice(0, 8);
  const regName = (id: string | null) => (id && (regulators.data || []).find((r) => r.id === id)?.name) || 'All regulators';

  const panels = useMemo(() => {
    const now = Date.now();
    return (panelData?.panels || []).map((p) => {
      const roster = (panelData?.members || []).filter(
        (m) => m.panel_id === p.id && m.is_active && (!m.effective_to || new Date(m.effective_to).getTime() > now),
      );
      const voting = roster.filter((m) => m.is_voting);
      const chair = roster.find((m) => m.is_chair);
      // Composition readiness is about PEOPLE only. Whether the panel is switched
      // on is a separate administrative decision and is never mixed in here.
      const ready = !!chair && voting.length >= p.quorum;
      const missing = [
        !chair ? 'a chair' : null,
        voting.length < p.quorum ? `${p.quorum - voting.length} more voting member(s)` : null,
      ].filter(Boolean) as string[];
      return { p, roster, voting, chair, ready, missing };
    });
  }, [panelData]);


  const policyMissing = (policies.data || []).length === 0;

  const save = async () => {
    if (prior === UNSET || adviser === UNSET) {
      toast.error('POLICY_CONFIGURATION_REQUIRED — both decisions must be stated explicitly');
      return;
    }
    try {
      await setPolicy.mutateAsync({
        appealScope: scope,
        priorDecisionMakerMaySit: prior === 'yes',
        legalAdviserVotes: adviser === 'yes',
        notes: notes || null,
      });
      toast.success('Appeal independence policy recorded');
    } catch (e) {
      toast.error((e as Error).message || 'Could not record the policy');
    }
  };

  return (
    <div className="space-y-4">
      {policyMissing && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="flex items-start gap-2 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-900">APPEAL INDEPENDENCE POLICY NOT CONFIGURED</p>
              <p className="text-amber-900/80">
                POLICY_CONFIGURATION_REQUIRED — no jurisdiction rule is assumed. Until an
                administrator records the policy below, the backend keeps its safe behaviour: a prior
                decision maker on the same matter is flagged
                (<code>APPEAL_INDEPENDENCE_POLICY_REQUIRED</code>) and a legal adviser does not vote.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Appeal panels</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {panels.map(({ p, roster, voting, chair, ready, missing }) => (
            <div key={p.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline">{p.appeal_scope}</Badge>
                <Badge variant="outline">{regName(p.regulator_id)}</Badge>
                <Badge variant={p.is_active ? 'default' : 'secondary'}>
                  {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
                <Badge variant={ready ? 'default' : 'outline'}>
                  {ready ? 'Composition ready' : 'Composition not ready'}
                </Badge>
                <Badge variant={policyMissing ? 'outline' : 'default'}>
                  {policyMissing ? 'Policy not configured' : 'Policy configured'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Quorum {p.quorum} · decision rule {p.decision_rule} · current voting members {voting.length}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                <Button
                  size="sm"
                  variant={p.is_active ? 'destructive' : 'default'}
                  disabled={panelMut.updatePanel.isPending}
                  onClick={() =>
                    act(
                      () => panelMut.updatePanel.mutateAsync({ panelId: p.id, isActive: !p.is_active }),
                      p.is_active ? 'Panel deactivated' : 'Panel activated',
                    )
                  }
                >
                  {p.is_active ? 'Deactivate panel' : 'Activate panel'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMemberDialog({ open: true, kind: 'panel', id: p.id, name: p.name })}
                >
                  + Add member
                </Button>
                <span className="text-xs text-muted-foreground">
                  {p.is_active
                    ? 'This panel may be selected for appeal matters.'
                    : 'While inactive this panel cannot be selected for appeal matters.'}
                </span>
              </div>


              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Chair</p>
                  {chair ? (
                    <MemberLine label={staffName(chair.user_id)} onRemove={() => removeMember('panel', chair.id)} />
                  ) : <p>—</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Voting members</p>
                  {voting.length ? voting.map((m) => (
                    <MemberLine key={m.id} label={staffName(m.user_id)} onRemove={() => removeMember('panel', m.id)} />
                  )) : <p>—</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Legal adviser</p>
                  {roster.filter((m) => m.member_role === 'legal_adviser').map((m) => (
                    <MemberLine
                      key={m.id}
                      label={staffName(m.user_id)}
                      hint="(non-voting unless configured)"
                      onRemove={() => removeMember('panel', m.id)}
                    />
                  ))}
                  {roster.every((m) => m.member_role !== 'legal_adviser') && <p>—</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Observers</p>
                  {roster.filter((m) => m.member_role === 'observer').map((m) => (
                    <MemberLine key={m.id} label={staffName(m.user_id)} onRemove={() => removeMember('panel', m.id)} />
                  ))}
                  {roster.every((m) => m.member_role !== 'observer') && <p>—</p>}
                </div>
              </div>

              {!ready && (
                <p className="mt-2 text-xs text-amber-700">
                  Composition still needs {missing.join(' and ')}. Quorum is never lowered and no
                  permission is granted to clear it. Whether a panel may hear a specific matter is
                  always decided case by case.
                </p>
              )}
              {ready && !p.is_active && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Composition is complete. This panel is switched off — use Activate panel to make it
                  available for appeals.
                </p>
              )}

            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            The same eligible person may sit on several panels; only an actual case conflict or the
            configured independence policy restricts them.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Appeal independence policy</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Appeal scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set((panelData?.panels || []).map((p) => p.appeal_scope))).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prior decision maker may sit</Label>
            <Select value={prior} onValueChange={setPrior}>
              <SelectTrigger><SelectValue placeholder="Not configured" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Not configured</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Legal adviser votes</Label>
            <Select value={adviser} onValueChange={setAdviser}>
              <SelectTrigger><SelectValue placeholder="Not configured" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Not configured</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Policy basis / notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reference the instrument or board decision that establishes this rule" />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={setPolicy.isPending}>Record policy</Button>
          </div>
          {(policies.data || []).length > 0 && (
            <div className="sm:col-span-2 space-y-1 text-sm">
              {(policies.data || []).map((p) => (
                <p key={p.id}>
                  {p.appeal_scope} · {regName(p.regulator_id)} — prior decision maker may sit:{' '}
                  {p.prior_decision_maker_may_sit ? 'yes' : 'no'}; legal adviser votes:{' '}
                  {p.legal_adviser_votes ? 'yes' : 'no'}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fit &amp; Proper committees</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(committeeData?.committees || []).map((c) => {
            const roster = (committeeData?.members || []).filter((m) => m.committee_id === c.id && m.is_active);
            const voters = roster.filter((m) => m.member_role !== 'observer');
            return (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="outline">{regName(c.regulator_id)}</Badge>
                  <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                  <Badge variant={voters.length >= c.quorum ? 'default' : 'outline'}>
                    {voters.length >= c.quorum ? 'Composition ready' : 'Composition not ready'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  At least <strong>{c.quorum}</strong> voting member(s) must take part in a sitting,
                  and at least <strong>{c.approval_threshold_pct}%</strong> of those present must vote
                  yes for a fit &amp; proper decision to pass — with {c.quorum} present that is{' '}
                  <strong>{Math.ceil((c.quorum * Number(c.approval_threshold_pct || 0)) / 100)}</strong>{' '}
                  approval(s). Currently {voters.length} voting member(s) appointed.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                  <Button
                    size="sm"
                    variant={c.is_active ? 'destructive' : 'default'}
                    disabled={committeeMut.updateCommittee.isPending}
                    onClick={() =>
                      act(
                        () => committeeMut.updateCommittee.mutateAsync({ committeeId: c.id, isActive: !c.is_active }),
                        c.is_active ? 'Committee deactivated' : 'Committee activated',
                      )
                    }
                  >
                    {c.is_active ? 'Deactivate committee' : 'Activate committee'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMemberDialog({ open: true, kind: 'committee', id: c.id, name: c.name })}
                  >
                    + Add member
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRuleDialog({
                        id: c.id,
                        name: c.name,
                        quorum: String(c.quorum),
                        pct: String(c.approval_threshold_pct ?? ''),
                      })
                    }
                  >
                    Decision rule
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {c.is_active
                      ? 'This committee may be selected for fit & proper decisions.'
                      : 'While inactive this committee cannot be selected for fit & proper decisions.'}
                  </span>
                </div>


                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Chair</p>
                    {roster.filter((m) => m.member_role === 'chair').map((m) => (
                      <MemberLine key={m.id} label={staffName(m.user_id)} onRemove={() => removeMember('committee', m.id)} />
                    ))}
                    {roster.every((m) => m.member_role !== 'chair') && <p>—</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Members</p>
                    {roster.filter((m) => m.member_role === 'member').map((m) => (
                      <MemberLine key={m.id} label={staffName(m.user_id)} onRemove={() => removeMember('committee', m.id)} />
                    ))}
                    {roster.every((m) => m.member_role !== 'member') && <p>—</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Observers / advisers</p>
                    {roster.filter((m) => !['chair', 'member'].includes(m.member_role)).map((m) => (
                      <MemberLine
                        key={m.id}
                        label={staffName(m.user_id)}
                        hint={`(${m.member_role})`}
                        onRemove={() => removeMember('committee', m.id)}
                      />
                    ))}
                    {roster.every((m) => ['chair', 'member'].includes(m.member_role)) && <p>—</p>}
                  </div>
                </div>

              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Committee composition is administered through the governed F&amp;P routines. Members may
            also hold F&amp;P operational, licensing, prudential or legal duties; independence is
            enforced per assessment by the existing maker/checker and conflict rules. Quorum and
            threshold values are existing configuration and are never invented here.
          </p>
        </CardContent>
      </Card>

      {/* Add member — three selections, nothing else. */}
      <Dialog open={!!memberDialog} onOpenChange={(v) => !v && setMemberDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add member — {memberDialog?.name}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Person</Label>
              <Select value={newMember} onValueChange={setNewMember}>
                <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {(staff.data || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(memberDialog?.kind === 'panel' ? PANEL_ROLES : COMMITTEE_ROLES).map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {memberDialog?.kind === 'panel' && (
                <div>
                  <Label className="text-xs">Votes on decisions</Label>
                  <Select value={newVoting} onValueChange={setNewVoting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Sitting on a decision body does not grant any permission. Eligibility for a specific
              matter is always decided case by case.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialog(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                await addMember();
                setMemberDialog(null);
              }}
              disabled={!newMember}
            >
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One roster line with an inline remove — roster-first, no nested management screen. */
function MemberLine({
  label, hint, onRemove,
}: {
  label: string;
  hint?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

