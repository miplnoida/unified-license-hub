import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useRegulators, useRegulatoryFunctions, useRegulatoryTeams, useSectors, useStaffPortfolios,
  useSubSectors, useSupervisedEntities, useTeamMembers, useTeamMutations,
} from '@/hooks/useOperatingStructure';
import { ResponsibilityDialog } from './ResponsibilityDialog';
import { PersonSectorResponsibilityDialog } from './SectorAssignDialogs';
import { AccessStatusNote } from './AccessStatusNote';
import { act, effectiveRange, TEAM_ROLES } from './shared';
import { usePortfolioMutations } from '@/hooks/useOperatingStructure';


/**
 * WHO works here and WHAT they are responsible for.
 *
 * One person may legitimately hold several areas of work, sit in several teams,
 * own several entities and serve on decision bodies — nothing here forces an
 * artificial separation. Canonical roles are shown but edited in User Management.
 */
export function PeopleTab({ initialUserId }: { initialUserId?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialUserId || null);
  const [search, setSearch] = useState('');
  const [respDialog, setRespDialog] = useState<{ open: boolean; portfolioId: string | null }>({
    open: false, portfolioId: null,
  });
  const [teamDialog, setTeamDialog] = useState<{ open: boolean; membershipId: string | null }>({
    open: false, membershipId: null,
  });
  const [teamPick, setTeamPick] = useState('');
  const [teamRole, setTeamRole] = useState('member');

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
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const members = useTeamMembers();
  const sectors = useSectors();
  const subSectors = useSubSectors();
  const entities = useSupervisedEntities();
  const portfolios = useStaffPortfolios();
  const { endPortfolio } = usePortfolioMutations();
  const { saveMember, endMember } = useTeamMutations();

  const p = profile.data || {};
  const fnName = (id: string | null) => (functions.data || []).find((f: any) => f.id === id)?.name || 'Area of work';
  const regName = (id: string | null) => (regulators.data || []).find((r: any) => r.id === id)?.name || '—';
  const teamName = (id: string | null) => (teams.data || []).find((t: any) => t.id === id)?.name || null;

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (directory.data || []).filter(
      (u: any) => !q || String(u.full_name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q),
    );
  }, [directory.data, search]);

  const myPortfolios = useMemo(
    () => (portfolios.data?.portfolios || []).filter((x: any) => x.user_id === selected && x.status === 'active'),
    [portfolios.data, selected],
  );
  const myMemberships = (members.data || []).filter((m: any) => m.user_id === selected && m.status === 'active');

  const scopeLines = (portfolioId: string) => {
    const scopes = (portfolios.data?.scopes || []).filter((s: any) => s.portfolio_id === portfolioId);
    if (scopes.length === 0) return ['All sectors'];
    return scopes.map((s: any) => {
      if (s.scope_kind === 'entity') return (entities.data || []).find((e: any) => e.id === s.entity_id)?.name || 'Entity';
      if (s.scope_kind === 'sub_sector') {
        const sub = (subSectors.data || []).find((x: any) => x.id === s.sub_sector_id);
        const sec = (sectors.data || []).find((x: any) => x.id === sub?.sector_id);
        return `${sec?.name ? `${sec.name} · ` : ''}${sub?.name || 'Sub-sector'}`;
      }
      return (sectors.data || []).find((x: any) => x.id === s.sector_id)?.name || 'Sector';
    });
  };

  const openTeamDialog = (membership?: any) => {
    setTeamPick(membership?.team_id || '');
    setTeamRole(membership?.member_role || 'member');
    setTeamDialog({ open: true, membershipId: membership?.id || null });
  };

  const submitTeam = async () => {
    if (!selected || !teamPick) return;
    const ok = await act(
      () => saveMember.mutateAsync({
        id: teamDialog.membershipId,
        teamId: teamPick,
        userId: selected,
        memberRole: teamRole,
      }),
      teamDialog.membershipId ? 'Unit membership updated' : 'Added to unit',
    );
    if (ok) setTeamDialog({ open: false, membershipId: null });
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="space-y-2">
            <CardTitle>People</CardTitle>
            <Input placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardHeader>
          <CardContent className="max-h-[560px] space-y-1 overflow-auto">
            {list.map((u: any) => (
              <button
                key={u.user_id}
                onClick={() => setSelected(u.user_id)}
                className={`w-full rounded-md border p-2 text-left text-sm hover:bg-accent/40 ${
                  selected === u.user_id ? 'border-primary bg-accent/30' : ''
                }`}
              >
                <div className="font-medium">{u.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {u.functions} {Number(u.functions) === 1 ? 'responsibility' : 'responsibilities'} ·{' '}
                  {u.teams} {Number(u.teams) === 1 ? 'unit' : 'units'}
                </div>
              </button>
            ))}
            {list.length === 0 && <p className="text-sm text-muted-foreground">No staff found.</p>}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{p?.user?.full_name || 'Select a person'}</CardTitle>
                {selected && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={p?.user?.status === 'inactive' ? 'secondary' : 'default'}>
                      {p?.user?.status || 'Active'}
                    </Badge>
                    {p?.user?.email}
                    {p?.user?.regulator_name ? ` · Home regulator: ${p.user.regulator_name}` : ''}
                    <span>
                      · {myPortfolios.length} {myPortfolios.length === 1 ? 'area of work' : 'areas of work'} ·{' '}
                      {myMemberships.length} {myMemberships.length === 1 ? 'unit' : 'units'}
                    </span>
                  </p>
                )}
              </div>
            </CardHeader>
            {selected && (
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase text-muted-foreground">Roles</span>
                  {(p.roles || []).map((r: any, i: number) => (
                    <Badge key={i} variant="outline">{r.name}</Badge>
                  ))}
                  {(p.roles || []).length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/users">Manage roles</Link>
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {selected && (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Responsibilities</CardTitle>
                  <Button size="sm" onClick={() => setChoice(true)}>
                    Add responsibility
                  </Button>

                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {myPortfolios.map((x: any) => (
                    <div key={x.id} className="rounded-md border p-3">
                      <p className="text-sm font-semibold uppercase">{fnName(x.regulatory_function_id)}</p>
                      <p className="mt-2 text-xs uppercase text-muted-foreground">Coverage</p>
                      <ul className="text-sm">
                        {scopeLines(x.id).map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                      {x.team_id && (
                        <>
                          <p className="mt-2 text-xs uppercase text-muted-foreground">Organisational unit</p>
                          <p className="text-sm">{teamName(x.team_id)}</p>
                        </>
                      )}
                      <p className="mt-2 text-xs uppercase text-muted-foreground">Effective</p>
                      <p className="text-sm">{effectiveRange(x.effective_from, x.effective_to)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{regName(x.regulator_id)}</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRespDialog({ open: true, portfolioId: x.id })}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(() => endPortfolio.mutateAsync({ portfolioId: x.id }), 'Responsibility ended')}
                        >
                          End
                        </Button>
                      </div>
                    </div>
                  ))}
                  {myPortfolios.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No responsibilities recorded — this person is not narrowed to any sector or entity.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Organisational units</CardTitle>
                  <Button size="sm" onClick={() => openTeamDialog()}>Add unit membership</Button>
                </CardHeader>
                <CardContent className="space-y-1">
                  {myMemberships.map((m: any) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span>
                        {teamName(m.team_id) || 'Team'}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {TEAM_ROLES.find((r) => r.value === m.member_role)?.label || m.member_role} ·{' '}
                          {effectiveRange(m.effective_from, m.effective_to)}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openTeamDialog(m)}>Change role</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(() => endMember.mutateAsync({ membershipId: m.id }), 'Membership ended')}
                        >
                          End
                        </Button>
                      </span>
                    </div>
                  ))}
                  {myMemberships.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No unit memberships. A unit only groups staff — it never grants a permission.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Block
                  title="Entity ownership"
                  items={(p.entity_assignments || []).map(
                    (e: any) => `${e.entity_name || 'Entity'} — ${e.function || 'Area of work'} (${e.role})`,
                  )}
                />
                <Block
                  title="Decision bodies"
                  items={[
                    ...(p.appeal_panels || []).map((x: any) => `${x.name} — ${x.is_voting ? 'Voting member' : x.member_role}`),
                    ...(p.committees || []).map((x: any) => `${x.name} — ${x.member_role}`),
                  ]}
                />
                <Block
                  title="Current case assignments"
                  items={(p.examinations || []).map((x: any) => `${x.reference || x.title} — ${x.team_role || 'member'}`)}
                />
                <Block
                  title="History"
                  items={[
                    ...(members.data || [])
                      .filter((m: any) => m.user_id === selected && m.status !== 'active')
                      .map((m: any) => `${teamName(m.team_id) || 'Team'} — ended ${effectiveRange(m.effective_from, m.effective_to)}`),
                    ...(portfolios.data?.portfolios || [])
                      .filter((x: any) => x.user_id === selected && x.status !== 'active')
                      .map((x: any) => `${fnName(x.regulatory_function_id)} — ended ${effectiveRange(x.effective_from, x.effective_to)}`),
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <ResponsibilityDialog
        open={respDialog.open}
        onOpenChange={(v) => setRespDialog({ open: v, portfolioId: v ? respDialog.portfolioId : null })}
        userId={selected}
        portfolioId={respDialog.portfolioId}
      />

      <Dialog open={teamDialog.open} onOpenChange={(v) => setTeamDialog({ open: v, membershipId: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{teamDialog.membershipId ? 'Change unit role' : 'Add unit membership'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Organisational unit</Label>
              <Select value={teamPick} onValueChange={setTeamPick} disabled={!!teamDialog.membershipId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Role in unit</Label>
              <Select value={teamRole} onValueChange={setTeamRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEAM_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialog({ open: false, membershipId: null })}>Cancel</Button>
            <Button onClick={submitTeam} disabled={!teamPick}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {items.map((t, i) => <p key={i}>{t}</p>)}
        {items.length === 0 && <p className="text-muted-foreground">None recorded.</p>}
      </CardContent>
    </Card>
  );
}
