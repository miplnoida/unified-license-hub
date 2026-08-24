import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/datetime';
import {
  useRegulators, useRegulatoryFunctions, useRegulatoryTeams, useStaffProfiles,
  useSupervisedEntities, useSupervisionAssignments, useSupervisionMutations, useTeamMembers,
} from '@/hooks/useOperatingStructure';

const ANY = 'any';
/** Sentinel values: shadcn Select cannot hold an empty string. */
const KEEP = 'keep';
const NONE = 'none';


/**
 * Canonical entity supervision, operated exclusively through the governed RPCs.
 *
 * Staff are never filtered out for performing another regulatory function — the
 * backend rejects only real problems (permission, scope, team eligibility,
 * expired membership, portfolio restriction, lead = alternate).
 */
export function EntitySupervisionTab() {
  const regulators = useRegulators();
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const staff = useStaffProfiles();
  const entities = useSupervisedEntities();
  const assignments = useSupervisionAssignments();
  const members = useTeamMembers();
  const { assign, transfer, end } = useSupervisionMutations();

  const [fRegulator, setFRegulator] = useState(ANY);
  const [fFunction, setFFunction] = useState(ANY);
  const [fTeam, setFTeam] = useState(ANY);
  const [fLead, setFLead] = useState(ANY);
  const [fStatus, setFStatus] = useState(ANY);
  const [fReview, setFReview] = useState(ANY);

  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [regulatorId, setRegulatorId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [altId, setAltId] = useState('');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const name = (list: any[] | undefined, id: string | null | undefined, key = 'name') =>
    (id && (list || []).find((x) => x.id === id)?.[key]) || '—';
  const staffName = (id: string | null | undefined) =>
    (id && (staff.data || []).find((s) => s.id === id)?.full_name) || '—';

  /** Eligible teams: active, matching the chosen regulator and regulatory function. */
  const eligibleTeams = useMemo(
    () =>
      (teams.data || []).filter(
        (t) =>
          t.status === 'active' &&
          (!functionId || t.regulatory_function_id === functionId) &&
          (!regulatorId || !t.regulator_id || t.regulator_id === regulatorId),
      ),
    [teams.data, functionId, regulatorId],
  );

  /** Members of the chosen team with a current (non-expired) active membership. */
  const eligibleStaff = useMemo(() => {
    const now = Date.now();
    if (!teamId) return staff.data || [];
    const ids = new Set(
      (members.data || [])
        .filter(
          (m) =>
            m.team_id === teamId &&
            m.status === 'active' &&
            (!m.effective_to || new Date(m.effective_to).getTime() > now),
        )
        .map((m) => m.user_id),
    );
    return (staff.data || []).filter((s) => ids.has(s.id));
  }, [teamId, members.data, staff.data]);

  const rows = useMemo(
    () =>
      (assignments.data || []).filter(
        (a) =>
          (fRegulator === ANY || a.regulator_id === fRegulator) &&
          (fFunction === ANY || a.regulatory_function_id === fFunction) &&
          (fTeam === ANY || a.team_id === fTeam) &&
          (fLead === ANY || a.lead_supervisor_user_id === fLead) &&
          (fStatus === ANY || a.status === fStatus) &&
          (fReview === ANY || String(!!a.requires_admin_review) === fReview),
      ),
    [assignments.data, fRegulator, fFunction, fTeam, fLead, fStatus, fReview],
  );

  const submit = async () => {
    if (!entityId || !functionId || !regulatorId) {
      toast.error('Entity, regulatory function and regulator are required');
      return;
    }
    if (leadId && altId && leadId === altId) {
      toast.error('The lead and alternate supervisor must be different people');
      return;
    }
    try {
      await assign.mutateAsync({
        entityId,
        regulatorId,
        functionId,
        teamId: teamId || null,
        leadUserId: leadId || null,
        alternateUserId: altId || null,
        reason: reason || null,
        effectiveFrom: from ? new Date(from).toISOString() : null,
        effectiveTo: to ? new Date(to).toISOString() : null,
      });
      toast.success('Supervision assigned');
      setOpen(false);
      setEntityId(''); setFunctionId(''); setTeamId(''); setLeadId(''); setAltId(''); setReason('');
    } catch (e) {
      toast.error((e as Error).message || 'The assignment was rejected');
    }
  };

  const closeAssignment = async (id: string) => {
    const why = window.prompt('Closure reason');
    if (!why) return;
    try {
      await end.mutateAsync({ assignmentId: id, reason: why });
      toast.success('Assignment ended');
    } catch (e) {
      toast.error((e as Error).message || 'Could not end the assignment');
    }
  };

  /**
   * Transfers are performed through a picker dialog: a raw user id is never typed.
   * The backend still re-checks team eligibility, scope and lead/alternate identity.
   */
  const [transferFor, setTransferFor] = useState<any | null>(null);
  const [tTeam, setTTeam] = useState(KEEP);
  const [tLead, setTLead] = useState(KEEP);
  const [tAlt, setTAlt] = useState(KEEP);
  const [tReason, setTReason] = useState('');
  const [tFrom, setTFrom] = useState('');

  const openTransfer = (a: any) => {
    setTransferFor(a);
    setTTeam(KEEP); setTLead(KEEP); setTAlt(KEEP); setTReason(''); setTFrom('');
  };

  /** Candidate supervisors for the transfer: members of the target team, else all staff. */
  const transferTeamId = tTeam !== KEEP ? tTeam : transferFor?.team_id || '';
  const transferStaff = useMemo(() => {
    const now = Date.now();
    if (!transferTeamId) return staff.data || [];
    const ids = new Set(
      (members.data || [])
        .filter(
          (m) =>
            m.team_id === transferTeamId &&
            m.status === 'active' &&
            (!m.effective_to || new Date(m.effective_to).getTime() > now),
        )
        .map((m) => m.user_id),
    );
    return (staff.data || []).filter((s) => ids.has(s.id));
  }, [transferTeamId, members.data, staff.data]);

  const transferTeams = useMemo(
    () =>
      (teams.data || []).filter(
        (t) =>
          t.status === 'active' &&
          (!transferFor?.regulatory_function_id || t.regulatory_function_id === transferFor.regulatory_function_id) &&
          (!transferFor?.regulator_id || !t.regulator_id || t.regulator_id === transferFor.regulator_id),
      ),
    [teams.data, transferFor],
  );

  const submitTransfer = async () => {
    if (!transferFor) return;
    if (!tReason.trim()) {
      toast.error('A transfer reason is required');
      return;
    }
    const lead = tLead === KEEP ? null : tLead;
    const alt = tAlt === KEEP ? null : tAlt === NONE ? null : tAlt;
    if (lead && alt && lead === alt) {
      toast.error('The lead and alternate supervisor must be different people');
      return;
    }
    try {
      await transfer.mutateAsync({
        assignmentId: transferFor.id,
        teamId: tTeam === KEEP ? null : tTeam,
        leadUserId: lead,
        alternateUserId: tAlt === KEEP ? null : alt,
        reason: tReason.trim(),
        effectiveFrom: tFrom ? new Date(tFrom).toISOString() : null,
      });
      toast.success('Supervision transferred');
      setTransferFor(null);
    } catch (e) {
      toast.error((e as Error).message || 'The transfer was rejected');
    }
  };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Entity supervision ({rows.length})</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Assign supervision</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Assign entity supervision</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Entity</Label>
                  <Select value={entityId} onValueChange={setEntityId}>
                    <SelectTrigger><SelectValue placeholder="Select an entity" /></SelectTrigger>
                    <SelectContent>
                      {(entities.data || []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Regulatory function</Label>
                  <Select value={functionId} onValueChange={(v) => { setFunctionId(v); setTeamId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select a function" /></SelectTrigger>
                    <SelectContent>
                      {(functions.data || []).filter((f) => f.status === 'active').map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Regulator</Label>
                  <Select value={regulatorId} onValueChange={(v) => { setRegulatorId(v); setTeamId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select the regulator" /></SelectTrigger>
                    <SelectContent>
                      {(regulators.data || []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Classification is re-derived server-side from the entity; this selection is validated, not trusted.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Team (eligible)</Label>
                  <Select value={teamId} onValueChange={(v) => { setTeamId(v); setLeadId(''); setAltId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {eligibleTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Lead supervisor</Label>
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {eligibleStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Alternate supervisor (deputy cover)</Label>
                  <Select value={altId} onValueChange={setAltId}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {eligibleStaff.filter((s) => s.id !== leadId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Effective from</Label>
                  <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Effective to (optional)</Label>
                  <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Assignment reason</Label>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Holding other roles, teams or regulatory functions never disqualifies a member of
                staff. The governed routine rejects only missing permission, wrong scope, ineligible
                or expired team membership, portfolio restriction, or lead = alternate.
              </p>
              <Button onClick={submit} disabled={assign.isPending}>Assign</Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Regulator', value: fRegulator, set: setFRegulator, options: (regulators.data || []).map((r) => ({ v: r.id, l: r.name })) },
              { label: 'Function', value: fFunction, set: setFFunction, options: (functions.data || []).map((f) => ({ v: f.id, l: f.name })) },
              { label: 'Team', value: fTeam, set: setFTeam, options: (teams.data || []).map((t) => ({ v: t.id, l: t.name })) },
              { label: 'Lead', value: fLead, set: setFLead, options: (staff.data || []).map((s) => ({ v: s.id, l: s.full_name })) },
              { label: 'Status', value: fStatus, set: setFStatus, options: ['active', 'ended', 'pending'].map((s) => ({ v: s, l: s })) },
              { label: 'Admin review', value: fReview, set: setFReview, options: [{ v: 'true', l: 'Requires review' }, { v: 'false', l: 'Clean' }] },
            ].map((f) => (
              <div key={f.label}>
                <Label className="text-xs">{f.label}</Label>
                <Select value={f.value} onValueChange={f.set}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All</SelectItem>
                    {f.options.map((o) => (
                      <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Entity</th>
                  <th className="p-2">Regulator</th>
                  <th className="p-2">Function</th>
                  <th className="p-2">Team</th>
                  <th className="p-2">Lead</th>
                  <th className="p-2">Alternate</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Effective</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="p-2 font-medium">
                      {name(entities.data, a.entity_id)}
                      {a.requires_admin_review && (
                        <Badge variant="destructive" className="ml-2">REQUIRES ADMIN REVIEW</Badge>
                      )}
                    </td>
                    <td className="p-2">{name(regulators.data, a.regulator_id)}</td>
                    <td className="p-2">{name(functions.data, a.regulatory_function_id)}</td>
                    <td className="p-2">{name(teams.data, a.team_id)}</td>
                    <td className="p-2">{staffName(a.lead_supervisor_user_id)}</td>
                    <td className="p-2">{staffName(a.alternate_supervisor_user_id)}</td>
                    <td className="p-2"><Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge></td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {a.effective_from ? formatDateTime(a.effective_from) : '—'}
                      {a.effective_to ? ` → ${formatDateTime(a.effective_to)}` : ''}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{a.assignment_reason || a.closure_reason || '—'}</td>
                    <td className="p-2">
                      {a.status === 'active' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openTransfer(a)}>Transfer</Button>
                          <Button size="sm" variant="ghost" onClick={() => closeAssignment(a.id)}>End</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="p-3 text-sm text-muted-foreground" colSpan={10}>No assignments match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Transfer supervision — pickers only, no raw identifiers */}
      <Dialog open={!!transferFor} onOpenChange={(o) => !o && setTransferFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Transfer supervision</DialogTitle></DialogHeader>
          {transferFor && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">Entity:</span> {name(entities.data, transferFor.entity_id)}</p>
                <p><span className="font-medium text-foreground">Function:</span> {name(functions.data, transferFor.regulatory_function_id)}</p>
                <p><span className="font-medium text-foreground">Current lead:</span> {staffName(transferFor.lead_supervisor_user_id)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Team</Label>
                  <Select value={tTeam} onValueChange={(v) => { setTTeam(v); setTLead(KEEP); setTAlt(KEEP); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Keep current team</SelectItem>
                      {transferTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Effective from</Label>
                  <Input type="date" value={tFrom} onChange={(e) => setTFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">New lead supervisor</Label>
                  <Select value={tLead} onValueChange={setTLead}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Keep current lead</SelectItem>
                      {transferStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">New alternate supervisor</Label>
                  <Select value={tAlt} onValueChange={setTAlt}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Keep current alternate</SelectItem>
                      <SelectItem value={NONE}>No alternate</SelectItem>
                      {transferStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Transfer reason</Label>
                  <Textarea rows={2} value={tReason} onChange={(e) => setTReason(e.target.value)}
                    placeholder="Why is supervision moving?" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Staff are not hidden for holding other duties. The transfer is re-checked server-side for
                permission, entity scope, team eligibility and lead/alternate separation.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setTransferFor(null)}>Cancel</Button>
                <Button onClick={submitTransfer} disabled={transfer.isPending || !tReason.trim()}>
                  Transfer supervision
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

