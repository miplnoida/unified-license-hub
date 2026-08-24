import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/datetime';
import {
  useRegulators, useRegulatoryFunctions, useRegulatoryTeams, useRegulatorMandates,
  useStaffProfiles, useTeamMandateLinks, useTeamMembers, useTeamMutations,
} from '@/hooks/useOperatingStructure';

const NONE = 'none';
const TEAM_TYPES = ['permanent', 'thematic', 'case', 'committee'];
const MEMBER_ROLES = ['lead', 'deputy', 'member', 'observer'];

const errText = (e: unknown) => {
  const raw = (e as any)?.message || String(e);
  return raw.replace(/^(BAD_INPUT|FORBIDDEN|UNAUTHORIZED|NOT_FOUND):\s*/, '');
};

/**
 * WHICH organisational unit — teams, their functional remit, their mandates and
 * their members. Every write goes through a governed SECURITY DEFINER routine;
 * the client holds no DML grant on any operating-structure table.
 */
export function TeamAdminTab() {
  const regulators = useRegulators();
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const members = useTeamMembers();
  const staff = useStaffProfiles();
  const mandates = useRegulatorMandates();
  const teamMandates = useTeamMandateLinks();
  const { saveTeam, setTeamStatus, saveMember, endMember, addTeamMandate, endTeamMandate } = useTeamMutations();

  const [selected, setSelected] = useState<string | null>(null);
  const [teamDialog, setTeamDialog] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    regulatorId: '', code: '', name: '', teamType: 'permanent', functionId: NONE, effectiveTo: '',
  });

  const [memberUser, setMemberUser] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [mandateId, setMandateId] = useState('');

  const staffName = (id: string | null) => {
    const p = (staff.data || []).find((s: any) => s.id === id);
    return p?.full_name || p?.email || 'Unknown user';
  };
  const fnName = (id: string | null) =>
    (functions.data || []).find((f: any) => f.id === id)?.name || 'Not function-specific';

  const team = useMemo(() => (teams.data || []).find((t: any) => t.id === selected) || null, [teams.data, selected]);
  const teamMemberRows = (members.data || []).filter((m: any) => m.team_id === selected);
  const linkedMandates = (teamMandates.data || []).filter(
    (l: any) => l.team_id === selected && !l.effective_to,
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      regulatorId: (regulators.data || [])[0]?.id || '', code: '', name: '',
      teamType: 'permanent', functionId: NONE, effectiveTo: '',
    });
    setTeamDialog(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      regulatorId: t.regulator_id || '', code: t.code || '', name: t.name || '',
      teamType: t.team_type || 'permanent', functionId: t.regulatory_function_id || NONE,
      effectiveTo: t.effective_to ? String(t.effective_to).slice(0, 10) : '',
    });
    setTeamDialog(true);
  };

  const submitTeam = async () => {
    try {
      await saveTeam.mutateAsync({
        id: editing?.id || null,
        regulatorId: form.regulatorId,
        code: form.code,
        name: form.name,
        teamType: form.teamType,
        functionId: form.functionId === NONE ? null : form.functionId,
        effectiveFrom: editing?.effective_from || new Date().toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
        status: editing?.status || 'active',
      });
      toast.success(editing ? 'Team updated' : 'Team created');
      setTeamDialog(false);
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errText(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Teams</CardTitle>
          <Button size="sm" onClick={openCreate}>New team</Button>
        </CardHeader>
        <CardContent className="max-h-[560px] space-y-1 overflow-auto">
          {(teams.data || []).map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full rounded-md border p-2 text-left text-sm hover:bg-accent/40 ${
                selected === t.id ? 'border-primary bg-accent/30' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t.name}</span>
                <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {t.code} · {t.team_type} · {fnName(t.regulatory_function_id)}
              </div>
            </button>
          ))}
          {(teams.data || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No teams configured yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>{team ? team.name : 'Select a team'}</CardTitle>
            {team && (
              <p className="text-xs text-muted-foreground">
                {team.code} · {team.team_type} · {fnName(team.regulatory_function_id)} · from{' '}
                {formatDateTime(team.effective_from)}
              </p>
            )}
          </div>
          {team && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(team)}>Edit</Button>
              <Button
                size="sm"
                variant={team.status === 'active' ? 'destructive' : 'secondary'}
                onClick={() =>
                  act(
                    () => setTeamStatus.mutateAsync({
                      teamId: team.id,
                      status: team.status === 'active' ? 'inactive' : 'active',
                    }),
                    team.status === 'active' ? 'Team deactivated' : 'Team reactivated',
                  )}
              >
                {team.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          )}
        </CardHeader>

        {team && (
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Members</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Label className="text-xs">Person</Label>
                  <Select value={memberUser} onValueChange={setMemberUser}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {(staff.data || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[160px]">
                  <Label className="text-xs">Team role</Label>
                  <Select value={memberRole} onValueChange={setMemberRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEMBER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!memberUser}
                  onClick={() =>
                    act(
                      () => saveMember.mutateAsync({ teamId: team.id, userId: memberUser, memberRole }),
                      'Membership saved',
                    )}
                >
                  Add / update
                </Button>
              </div>

              <div className="space-y-1">
                {teamMemberRows.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div>
                      <span className="font-medium">{staffName(m.user_id)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {m.member_role} · {m.status}
                        {m.effective_to ? ` · until ${formatDateTime(m.effective_to)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.member_role}
                        onValueChange={(v) =>
                          act(
                            () => saveMember.mutateAsync({
                              id: m.id, teamId: team.id, userId: m.user_id, memberRole: v,
                              effectiveFrom: m.effective_from, effectiveTo: m.effective_to,
                            }),
                            'Team role updated',
                          )}
                      >
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MEMBER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {m.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act(() => endMember.mutateAsync({ membershipId: m.id }), 'Membership ended')}
                        >
                          End
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {teamMemberRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">No members recorded for this team.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Mandates carried by this team</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[280px] flex-1">
                  <Label className="text-xs">Regulator mandate</Label>
                  <Select value={mandateId} onValueChange={setMandateId}>
                    <SelectTrigger><SelectValue placeholder="Select mandate" /></SelectTrigger>
                    <SelectContent>
                      {(mandates.data?.mandates || [])
                        .filter((m: any) => m.status === 'active')
                        .map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {fnName(m.regulatory_function_id)} · {m.responsibility_type}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!mandateId}
                  onClick={() =>
                    act(() => addTeamMandate.mutateAsync({ teamId: team.id, mandateId }), 'Mandate attached')}
                >
                  Attach
                </Button>
              </div>
              <div className="space-y-1">
                {linkedMandates.map((l: any) => {
                  const m = (mandates.data?.mandates || []).find((x: any) => x.id === l.regulator_mandate_id);
                  return (
                    <div key={l.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>
                        {fnName(m?.regulatory_function_id)}{' '}
                        <span className="text-xs text-muted-foreground">{m?.responsibility_type}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(() => endTeamMandate.mutateAsync({ id: l.id }), 'Mandate detached')}
                      >
                        Detach
                      </Button>
                    </div>
                  );
                })}
                {linkedMandates.length === 0 && (
                  <p className="text-sm text-muted-foreground">No mandates attached to this team.</p>
                )}
              </div>
            </section>
          </CardContent>
        )}
      </Card>

      <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit team' : 'New team'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Regulator</Label>
              <Select value={form.regulatorId} onValueChange={(v) => setForm({ ...form, regulatorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select regulator" /></SelectTrigger>
                <SelectContent>
                  {(regulators.data || []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.teamType} onValueChange={(v) => setForm({ ...form, teamType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Regulatory function</Label>
              <Select value={form.functionId} onValueChange={(v) => setForm({ ...form, functionId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not function-specific</SelectItem>
                  {(functions.data || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ends on (optional)</Label>
              <Input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialog(false)}>Cancel</Button>
            <Button onClick={submitTeam} disabled={!form.regulatorId || !form.code || !form.name}>
              {editing ? 'Save changes' : 'Create team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
