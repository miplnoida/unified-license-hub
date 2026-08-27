import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/datetime';
import {
  usePortfolioMutations, useActiveRegulators, useRegulators, useRegulatoryFunctions, useRegulatoryTeams,
  useActiveSectors, useActiveSubSectors, useSectors, useStaffPortfolios, useSubSectors, useSupervisedEntities,
  useTeamMembers, useTeamMutations,
} from '@/hooks/useOperatingStructure';

const NONE = 'none';
const MEMBER_ROLES = ['lead', 'deputy', 'member', 'observer'];

const errText = (e: unknown) =>
  ((e as any)?.message || String(e)).replace(/^(BAD_INPUT|FORBIDDEN|UNAUTHORIZED|NOT_FOUND):\s*/, '');

/**
 * WHO works here, WHAT they are responsible for and WHERE it applies.
 *
 * A person may legitimately hold several functions, teams and portfolios at
 * once — nothing here filters them out for overlap. Recording a responsibility
 * never grants a permission: it only narrows where existing permissions apply.
 */
export function StaffResponsibilityTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const directory = useQuery({
    queryKey: ['staff-responsibility-directory-detail'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('staff_responsibility_directory');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as any[];
    },
  });

  const profile = useQuery({
    queryKey: ['staff-responsibility-profile', selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('staff_responsibility_profile', { _user_id: selected });
      if (error) throw error;
      return data as any;
    },
  });

  const regulators = useRegulators();
  const activeRegulators = useActiveRegulators();
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const members = useTeamMembers();
  const sectors = useSectors();
  const activeSectors = useActiveSectors();
  const activeSubSectors = useActiveSubSectors();
  const subSectors = useSubSectors();
  const entities = useSupervisedEntities();
  const portfolios = useStaffPortfolios();
  const { savePortfolio, endPortfolio, addScope, removeScope } = usePortfolioMutations();
  const { saveMember, endMember } = useTeamMutations();

  const [pf, setPf] = useState({ regulatorId: '', functionId: '', teamId: NONE, notes: '' });
  const [teamPick, setTeamPick] = useState('');
  const [teamRole, setTeamRole] = useState('member');
  const [scopeState, setScopeState] = useState<Record<string, { kind: string; value: string }>>({});

  const p = profile.data || {};
  const myPortfolios = useMemo(
    () => (portfolios.data?.portfolios || []).filter((x: any) => x.user_id === selected && x.status === 'active'),
    [portfolios.data, selected],
  );
  const myMemberships = (members.data || []).filter((m: any) => m.user_id === selected && m.status === 'active');

  const fnName = (id: string | null) => (functions.data || []).find((f: any) => f.id === id)?.name || '—';
  const regName = (id: string | null) => (regulators.data || []).find((r: any) => r.id === id)?.name || '—';
  const teamName = (id: string | null) => (teams.data || []).find((t: any) => t.id === id)?.name || null;

  const scopeLabel = (s: any) => {
    if (s.scope_kind === 'entity') {
      return (entities.data || []).find((e: any) => e.id === s.entity_id)?.name || 'Entity';
    }
    if (s.scope_kind === 'sub_sector') {
      return (subSectors.data || []).find((x: any) => x.id === s.sub_sector_id)?.name || 'Sub-sector';
    }
    return (sectors.data || []).find((x: any) => x.id === s.sector_id)?.name || 'Sector';
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const openDrawer = () => {
    setPf({ regulatorId: (activeRegulators.data || []).length === 1 ? (activeRegulators.data as any[])[0].id : '', functionId: '', teamId: NONE, notes: '' });
    setDrawer(true);
  };

  const addPortfolio = () =>
    act(async () => {
      await savePortfolio.mutateAsync({
        userId: selected!,
        regulatorId: pf.regulatorId,
        functionId: pf.functionId,
        teamId: pf.teamId === NONE ? null : pf.teamId,
        notes: pf.notes || null,
      });
      setPf({ ...pf, functionId: '', teamId: NONE, notes: '' });
    }, 'Responsibility recorded');

  const addCoverage = (portfolioId: string) => {
    const st = scopeState[portfolioId];
    if (!st?.kind || !st?.value) return;
    act(
      () => addScope.mutateAsync({
        portfolioId,
        scopeKind: st.kind as 'sector' | 'sub_sector' | 'entity',
        sectorId: st.kind === 'sector' ? st.value : null,
        subSectorId: st.kind === 'sub_sector' ? st.value : null,
        entityId: st.kind === 'entity' ? st.value : null,
      }),
      'Coverage added',
    );
  };

  const scopeOptions = (kind: string) => {
    if (kind === 'sector') return (activeSectors.data || []).map((s: any) => ({ id: s.id, name: s.name }));
    if (kind === 'sub_sector') return (activeSubSectors.data || []).map((s: any) => ({ id: s.id, name: s.name }));
    return (entities.data || []).map((s: any) => ({ id: s.id, name: s.name }));
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Internal staff</CardTitle></CardHeader>
          <CardContent className="max-h-[560px] space-y-1 overflow-auto">
            {(directory.data || []).map((u: any) => (
              <button
                key={u.user_id}
                onClick={() => setSelected(u.user_id)}
                className={`w-full rounded-md border p-2 text-left text-sm hover:bg-accent/40 ${
                  selected === u.user_id ? 'border-primary bg-accent/30' : ''
                }`}
              >
                <div className="font-medium">{u.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {u.roles} roles · {u.teams} teams · {u.functions} functions · {u.entities} entities
                </div>
              </button>
            ))}
            {(directory.data || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No internal staff visible.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{p?.user?.full_name || 'Select a member of staff'}</CardTitle>
              {p?.user?.email && <p className="text-xs text-muted-foreground">{p.user.email}</p>}
            </div>
            {selected && <Button data-rbac="user_management.edit" size="sm" onClick={openDrawer}>Edit responsibilities</Button>}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Block title="Roles (what they may do)" items={(p.roles || []).map((r: any) => r.name)} />
            <Block
              title="Teams"
              items={(p.teams || []).map((t: any) => `${t.name} — ${t.member_role}${t.expired ? ' (expired)' : ''}`)}
            />
            <Block
              title="Functional responsibilities"
              items={myPortfolios.map(
                (x: any) => `${fnName(x.regulatory_function_id)} — ${regName(x.regulator_id)}`,
              )}
            />
            <Block
              title="Entity responsibilities"
              items={(p.entity_assignments || []).map(
                (e: any) => `${e.entity_name || 'Entity'} — ${e.function || 'Function'} ${e.role}`,
              )}
            />
            <Block
              title="Examination roles"
              items={(p.examinations || []).map((x: any) => `${x.reference || x.title} — ${x.team_role || 'member'}`)}
            />
            <Block
              title="Decision bodies"
              items={[
                ...(p.appeal_panels || []).map((x: any) => `${x.name} — ${x.is_voting ? 'Voting Member' : x.member_role}`),
                ...(p.committees || []).map((x: any) => `${x.name} — ${x.member_role}`),
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{p?.user?.full_name || 'Responsibilities'}</SheetTitle>
          </SheetHeader>

          <p className="mt-2 text-xs text-muted-foreground">
            Responsibilities record <span className="font-medium">where</span> this person's existing
            permissions apply. They never grant a permission — role grants remain the only source of
            what a user may do.
          </p>

          <section className="mt-5 space-y-3">
            <h3 className="text-sm font-semibold">Team memberships</h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <Label className="text-xs">Team</Label>
                <Select value={teamPick} onValueChange={setTeamPick}>
                  <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>
                    {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[130px]">
                <Label className="text-xs">Role</Label>
                <Select value={teamRole} onValueChange={setTeamRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button data-rbac="user_management.create"
                size="sm"
                disabled={!teamPick || !selected}
                onClick={() =>
                  act(
                    () => saveMember.mutateAsync({ teamId: teamPick, userId: selected!, memberRole: teamRole }),
                    'Team membership saved',
                  )}
              >
                Add
              </Button>
            </div>
            {myMemberships.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>
                  {teamName(m.team_id) || 'Team'}{' '}
                  <span className="text-xs text-muted-foreground">{m.member_role}</span>
                </span>
                <GuardedButton module="user_management" action="edit" data-rbac="user_management.edit"
                  size="sm"
                  variant="outline"
                  onClick={() => act(() => endMember.mutateAsync({ membershipId: m.id }), 'Membership ended')}
                >
                  End
                </GuardedButton>
              </div>
            ))}
            {myMemberships.length === 0 && (
              <p className="text-sm text-muted-foreground">No active team memberships.</p>
            )}
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold">Functional responsibilities</h3>
            <div className="grid gap-2 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Regulator</Label>
                  <Select value={pf.regulatorId} onValueChange={(v) => setPf({ ...pf, regulatorId: v })}>
                    <SelectTrigger><SelectValue placeholder="Regulator" /></SelectTrigger>
                    <SelectContent>
                      {(activeRegulators.data || []).map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Function</Label>
                  <Select value={pf.functionId} onValueChange={(v) => setPf({ ...pf, functionId: v })}>
                    <SelectTrigger><SelectValue placeholder="Function" /></SelectTrigger>
                    <SelectContent>
                      {(functions.data || []).filter((f: any) => f.status === 'active').map((f: any) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Through team (optional)</Label>
                <Select value={pf.teamId} onValueChange={(v) => setPf({ ...pf, teamId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No team</SelectItem>
                    {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={pf.notes} onChange={(e) => setPf({ ...pf, notes: e.target.value })} />
              </div>
              <Button data-rbac="user_management.create" size="sm" disabled={!selected || !pf.regulatorId || !pf.functionId} onClick={addPortfolio}>
                Add responsibility
              </Button>
            </div>

            {myPortfolios.map((x: any) => {
              const scopes = (portfolios.data?.scopes || []).filter((s: any) => s.portfolio_id === x.id);
              const st = scopeState[x.id] || { kind: 'sector', value: '' };
              return (
                <div key={x.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{fnName(x.regulatory_function_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {regName(x.regulator_id)}
                        {x.team_id ? ` · ${teamName(x.team_id)}` : ''} · from {formatDateTime(x.effective_from)}
                      </p>
                    </div>
                    <GuardedButton module="user_management" action="edit" data-rbac="user_management.edit"
                      size="sm"
                      variant="outline"
                      onClick={() => act(() => endPortfolio.mutateAsync({ portfolioId: x.id }), 'Responsibility ended')}
                    >
                      End
                    </GuardedButton>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {scopes.length === 0 && (
                      <Badge variant="secondary">No coverage rows — this function is not narrowed</Badge>
                    )}
                    {scopes.map((s: any) => (
                      <Badge key={s.id} variant="outline" className="gap-1">
                        {s.scope_kind.replace('_', '-')}: {scopeLabel(s)}
                        <button
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => act(() => removeScope.mutateAsync({ scopeId: s.id }), 'Coverage removed')}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-[140px]">
                      <Label className="text-xs">Coverage</Label>
                      <Select
                        value={st.kind}
                        onValueChange={(v) => setScopeState({ ...scopeState, [x.id]: { kind: v, value: '' } })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sector">Sector</SelectItem>
                          <SelectItem value="sub_sector">Sub-sector</SelectItem>
                          <SelectItem value="entity">Entity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <Label className="text-xs">Value</Label>
                      <Select
                        value={st.value}
                        onValueChange={(v) => setScopeState({ ...scopeState, [x.id]: { ...st, value: v } })}
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {scopeOptions(st.kind).map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button data-rbac="user_management.create" size="sm" variant="secondary" onClick={() => addCoverage(x.id)}>Add</Button>
                  </div>
                </div>
              );
            })}
            {myPortfolios.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No functional responsibilities recorded — portfolios therefore place no restriction on this user.
              </p>
            )}
          </section>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {items.map((i, idx) => <li key={idx}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}
