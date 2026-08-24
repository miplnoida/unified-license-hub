import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import {
  useAppealIndependenceMutation, useAppealIndependencePolicies, useAppealPanelsWithMembers,
  useFpCommittees, useRegulators, useStaffDirectory,
} from '@/hooks/useOperatingStructure';

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
      const ready = p.is_active && !!chair && voting.length >= p.quorum;
      return { p, roster, voting, chair, ready };
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
          {panels.map(({ p, roster, voting, chair, ready }) => (
            <div key={p.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline">{p.appeal_scope}</Badge>
                <Badge variant="outline">{regName(p.regulator_id)}</Badge>
                <Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'active' : 'inactive'}</Badge>
                <Badge variant={ready ? 'default' : 'destructive'}>{ready ? 'READY' : 'NOT READY'}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Quorum {p.quorum} · decision rule {p.decision_rule} · current voting members {voting.length}
              </p>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Chair</p>
                  <p>{chair ? staffName(chair.user_id) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Voting members</p>
                  {voting.length ? voting.map((m) => <p key={m.id}>{staffName(m.user_id)}</p>) : <p>—</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Legal adviser</p>
                  {roster.filter((m) => m.member_role === 'legal_adviser').map((m) => (
                    <p key={m.id}>{staffName(m.user_id)} <span className="text-xs text-muted-foreground">(non-voting unless configured)</span></p>
                  ))}
                  {roster.every((m) => m.member_role !== 'legal_adviser') && <p>—</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Observers</p>
                  {roster.filter((m) => m.member_role === 'observer').map((m) => <p key={m.id}>{staffName(m.user_id)}</p>)}
                  {roster.every((m) => m.member_role !== 'observer') && <p>—</p>}
                </div>
              </div>
              {!ready && (
                <p className="mt-2 text-xs text-amber-700">
                  PANEL_BELOW_QUORUM — staffing/governance warning. Quorum is not lowered and no
                  permission is granted to clear it.
                </p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Composition is managed in Admin → Appeal Panels. The same eligible person may sit on
            several panels; only actual case conflict or configured independence policy restricts them.
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
                  <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'active' : 'inactive'}</Badge>
                  {voters.length < c.quorum && <Badge variant="destructive">COMMITTEE_BELOW_QUORUM</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quorum {c.quorum} · approval threshold {c.approval_threshold_pct}% · voting members {voters.length}
                </p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Chair</p>
                    {roster.filter((m) => m.member_role === 'chair').map((m) => <p key={m.id}>{staffName(m.user_id)}</p>)}
                    {roster.every((m) => m.member_role !== 'chair') && <p>—</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Members</p>
                    {roster.filter((m) => m.member_role === 'member').map((m) => <p key={m.id}>{staffName(m.user_id)}</p>)}
                    {roster.every((m) => m.member_role !== 'member') && <p>—</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Observers / advisers</p>
                    {roster.filter((m) => !['chair', 'member'].includes(m.member_role)).map((m) => (
                      <p key={m.id}>{staffName(m.user_id)} <span className="text-xs text-muted-foreground">({m.member_role})</span></p>
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
    </div>
  );
}
