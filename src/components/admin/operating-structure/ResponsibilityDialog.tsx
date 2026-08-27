import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  usePortfolioMutations, useRegulatoryFunctions, useRegulatoryTeams,
  SECTOR_GROUP_LABELS, SECTOR_GROUP_ORDER, useActiveSectors, useActiveSubSectors,
  useStaffDirectory, useStaffPortfolios, useSubSectors, useSupervisedEntities,
} from '@/hooks/useOperatingStructure';
import { act, NONE } from './shared';
import { useRegulatorResolution } from './regulatorResolution';

type AppliesTo = 'all' | 'sector' | 'sub_sector' | 'entity';

/** One area of work's coverage/team configuration. */
type AreaConfig = {
  appliesTo: AppliesTo;
  sectorId: string;
  picked: string[];
  teamId: string;
};

type Resolved = { regulatorId: string; regulatorName: string; notConfigured: boolean; reason: string };

export interface ResponsibilityDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  /** Existing responsibility to edit, or null to add new ones. */
  portfolioId?: string | null;
  /** Pre-selected areas of work and place, used when assigning from Coverage. */
  preset?: {
    functionId?: string;
    functionIds?: string[];
    sectorId?: string;
    subSectorId?: string;
    teamId?: string;
  };
  /** Optional heading override, e.g. "Assign sector lead". */
  title?: string;
  onSaved?: () => void;
}

const blank = (): AreaConfig => ({ appliesTo: 'all', sectorId: '', picked: [], teamId: NONE });


/**
 * Recording WHAT a person is responsible for and WHERE it applies.
 *
 * ADD mode records SEVERAL areas of work at once — one governed portfolio per
 * area, never an array of functions inside one portfolio. EDIT mode stays a
 * single existing responsibility. Recording a responsibility never grants a
 * permission; it only narrows where existing permissions apply.
 */
export function ResponsibilityDialog({
  open, onOpenChange, userId, portfolioId, preset, title, onSaved,
}: ResponsibilityDialogProps) {

  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const subSectors = useSubSectors();
  const portfolios = useStaffPortfolios();
  const staff = useStaffDirectory();
  const { savePortfolio, addScope, removeScope, batchSaveResponsibilities } = usePortfolioMutations();

  const editing = !!portfolioId;

  const existing = useMemo(
    () => (portfolios.data?.portfolios || []).find((p: any) => p.id === portfolioId) || null,
    [portfolios.data, portfolioId],
  );
  const existingScopes = useMemo(
    () => (portfolios.data?.scopes || []).filter((s: any) => s.portfolio_id === portfolioId),
    [portfolios.data, portfolioId],
  );

  const [personId, setPersonId] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [areaSearch, setAreaSearch] = useState('');
  const [sameForAll, setSameForAll] = useState(true);
  const [customize, setCustomize] = useState(false);
  const [shared, setShared] = useState<AreaConfig>(blank());
  const [perArea, setPerArea] = useState<Record<string, AreaConfig>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [advanced, setAdvanced] = useState(false);

  const targetUser = userId || existing?.user_id || personId;

  const activeFunctions = useMemo(
    () => (functions.data || []).filter((f: any) => f.status === 'active'),
    [functions.data],
  );

  useEffect(() => {
    if (!open) return;
    setResolved({});
    setAreaSearch('');
    setUpdateExisting(false);
    setFrom(existing?.effective_from ? String(existing.effective_from).slice(0, 10) : '');
    setTo(existing?.effective_to ? String(existing.effective_to).slice(0, 10) : '');
    setNotes(existing?.notes || '');
    setPerArea({});
    setCustomize(false);
    setSameForAll(true);

    const first = existing?.regulatory_function_id || preset?.functionId || '';
    const many = !existing && !preset?.functionId ? preset?.functionIds || [] : [];
    setAreas(many.length ? many : first ? [first] : []);


    const cfg = blank();
    cfg.teamId = existing?.team_id || preset?.teamId || NONE;
    if (existingScopes.length) {
      const kind = existingScopes[0].scope_kind as AppliesTo;
      cfg.appliesTo = kind;
      if (kind === 'sector') cfg.picked = existingScopes.map((s: any) => s.sector_id);
      else if (kind === 'sub_sector') {
        cfg.picked = existingScopes.map((s: any) => s.sub_sector_id);
        cfg.sectorId =
          (subSectors.data || []).find((s: any) => s.id === existingScopes[0].sub_sector_id)?.sector_id || '';
      } else cfg.picked = existingScopes.map((s: any) => s.entity_id);
    } else if (preset?.subSectorId) {
      cfg.appliesTo = 'sub_sector';
      cfg.picked = [preset.subSectorId];
      cfg.sectorId = preset.sectorId || '';
    } else if (preset?.sectorId) {
      cfg.appliesTo = 'sector';
      cfg.picked = [preset.sectorId];
      cfg.sectorId = preset.sectorId;
    }
    setShared(cfg);
  }, [open, portfolioId, existingScopes.length, preset?.functionId, preset?.functionIds?.join(','), preset?.sectorId, preset?.subSectorId]);

  const configFor = (fid: string): AreaConfig => (customize ? perArea[fid] || shared : shared);
  const setAreaConfig = (fid: string, patch: Partial<AreaConfig>) =>
    setPerArea((prev) => ({ ...prev, [fid]: { ...(prev[fid] || shared), ...patch } }));

  const toggleArea = (fid: string) =>
    setAreas((prev) => (prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid]));

  /** Active responsibilities this person already holds, by area of work. */
  const already = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of portfolios.data?.portfolios || []) {
      if (p.user_id === targetUser && p.status === 'active' && p.id !== portfolioId)
        map.set(p.regulatory_function_id, p.id);
    }
    return map;
  }, [portfolios.data, targetUser, portfolioId]);

  const blocked = areas.filter((fid) => resolved[fid]?.notConfigured || !resolved[fid]?.regulatorId);
  const incomplete = areas.filter((fid) => {
    const c = configFor(fid);
    return c.appliesTo !== 'all' && c.picked.length === 0;
  });
  const willWrite = areas.filter((fid) => updateExisting || !already.has(fid));

  const regulatorNames = Array.from(
    new Set(areas.map((fid) => resolved[fid]?.regulatorName).filter(Boolean) as string[]),
  );
  const singleRegulatorShown = regulatorNames.length === 1;

  const submitEdit = async () => {
    if (!targetUser || areas.length !== 1) return;
    const fid = areas[0];
    const c = shared;
    const regulatorId = resolved[fid]?.regulatorId;
    if (!regulatorId) return;
    const ok = await act(async () => {
      const saved: any = await savePortfolio.mutateAsync({
        id: portfolioId || null,
        userId: targetUser,
        regulatorId,
        functionId: fid,
        teamId: c.teamId === NONE ? null : c.teamId,
        effectiveFrom: from ? new Date(from).toISOString() : existing?.effective_from || new Date().toISOString(),
        effectiveTo: to ? new Date(to).toISOString() : null,
        notes: notes || null,
      });
      const id: string =
        typeof saved === 'string' ? saved : saved?.id || saved?.portfolio_id || portfolioId || '';
      for (const s of existingScopes) {
        const value =
          s.scope_kind === 'sector' ? s.sector_id : s.scope_kind === 'sub_sector' ? s.sub_sector_id : s.entity_id;
        if (c.appliesTo === 'all' || s.scope_kind !== c.appliesTo || !c.picked.includes(value))
          await removeScope.mutateAsync({ scopeId: s.id });
      }
      if (c.appliesTo !== 'all' && id) {
        const have = new Set(
          existingScopes
            .filter((s: any) => s.scope_kind === c.appliesTo)
            .map((s: any) =>
              c.appliesTo === 'sector' ? s.sector_id : c.appliesTo === 'sub_sector' ? s.sub_sector_id : s.entity_id,
            ),
        );
        for (const value of c.picked) {
          if (have.has(value)) continue;
          await addScope.mutateAsync({
            portfolioId: id,
            scopeKind: c.appliesTo,
            sectorId: c.appliesTo === 'sector' ? value : null,
            subSectorId: c.appliesTo === 'sub_sector' ? value : null,
            entityId: c.appliesTo === 'entity' ? value : null,
          });
        }
      }
    }, 'Responsibility updated');
    if (ok) { onOpenChange(false); onSaved?.(); }
  };

  const submitBatch = async () => {
    if (!targetUser || willWrite.length === 0) return;
    const items = willWrite.map((fid) => {
      const c = configFor(fid);
      return {
        regulatory_function_id: fid,
        regulator_id: resolved[fid]?.regulatorId || null,
        team_id: c.teamId === NONE ? null : c.teamId,
        applies_to: c.appliesTo,
        values: c.appliesTo === 'all' ? [] : c.picked,
        effective_from: from ? new Date(from).toISOString() : new Date().toISOString(),
        effective_to: to ? new Date(to).toISOString() : null,
        notes: notes || null,
        mode: already.has(fid) ? 'update' : 'create',
      };
    });
    const ok = await act(async () => {
      const res: any = await batchSaveResponsibilities.mutateAsync({ userId: targetUser, items });
      if (res && res.ok === false) {
        const first = (res.errors || [])[0];
        throw new Error(
          first ? `${first.function_name ? `${first.function_name}: ` : ''}${first.message}` : 'Nothing was saved.',
        );
      }
    }, willWrite.length === 1 ? 'Responsibility added' : `${willWrite.length} responsibilities saved`);
    if (ok) { onOpenChange(false); onSaved?.(); }
  };

  const canSave =
    !!targetUser &&
    areas.length > 0 &&
    blocked.length === 0 &&
    incomplete.length === 0 &&
    (editing || willWrite.length > 0);

  const filteredFunctions = activeFunctions.filter(
    (f: any) => !areaSearch.trim() || String(f.name).toLowerCase().includes(areaSearch.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || (editing ? 'Edit responsibility' : 'Add responsibilities')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {!userId && !editing && (
            <div>
              <Label className="text-xs">Person</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {(staff.data || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Regulator is derived per area of work, never picked from a list of every record. */}
          {singleRegulatorShown && (
            <p className="text-xs text-muted-foreground">
              Regulator: <span className="font-medium text-foreground">{regulatorNames[0]}</span>
            </p>
          )}

          {/* ---------- Areas of work ---------- */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{editing ? 'Area of work' : 'Areas of work'}</Label>
              {!editing && (
                <span className="text-xs text-muted-foreground">
                  {areas.length} {areas.length === 1 ? 'area selected' : 'areas selected'}
                </span>
              )}
            </div>
            {editing ? (
              <Select value={areas[0] || ''} onValueChange={(v) => setAreas([v])}>
                <SelectTrigger><SelectValue placeholder="Select area of work" /></SelectTrigger>
                <SelectContent>
                  {activeFunctions.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2 rounded-md border p-2">
                {activeFunctions.length > 6 && (
                  <Input
                    placeholder="Search areas of work"
                    value={areaSearch}
                    onChange={(e) => setAreaSearch(e.target.value)}
                  />
                )}
                <div className="max-h-48 space-y-1 overflow-auto">
                  {filteredFunctions.map((f: any) => (
                    <label key={f.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Checkbox checked={areas.includes(f.id)} onCheckedChange={() => toggleArea(f.id)} />
                        {f.name}
                      </span>
                      {already.has(f.id) && <Badge variant="secondary">Already assigned</Badge>}
                    </label>
                  ))}
                  {filteredFunctions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No area of work matches that search.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {!editing && areas.length > 1 && (
            <div className="space-y-2 rounded-md border p-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sameForAll && !customize}
                  onCheckedChange={(v) => { setSameForAll(!!v); if (v) setCustomize(false); }}
                />
                Apply the same coverage to all selected areas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={customize}
                  onCheckedChange={(v) => { setCustomize(!!v); if (v) setSameForAll(false); }}
                />
                Customise coverage/team by area
              </label>
            </div>
          )}

          {/* ---------- Shared coverage ---------- */}
          {!customize && (
            <AreaCoverage
              config={shared}
              onChange={(patch) => setShared((c) => ({ ...c, ...patch }))}
              teams={teams.data || []}
            />
          )}


          {/* ---------- Per-area rows ---------- */}
          {areas.length > 0 && (
            <div className="space-y-2">
              {areas.map((fid) => {
                const fn = activeFunctions.find((f: any) => f.id === fid);
                return (
                  <AreaRow
                    key={fid}
                    functionId={fid}
                    name={fn?.name || 'Area of work'}
                    config={configFor(fid)}
                    customise={customize}
                    showRegulator={!singleRegulatorShown}
                    state={already.has(fid) ? (updateExisting ? 'Will update' : 'Already assigned') : 'New'}
                    teams={teams.data || []}
                    onChange={(patch) => setAreaConfig(fid, patch)}
                    onResolved={(r) =>
                      setResolved((prev) =>
                        prev[fid] &&
                        prev[fid].regulatorId === r.regulatorId &&
                        prev[fid].notConfigured === r.notConfigured
                          ? prev
                          : { ...prev, [fid]: r },
                      )
                    }
                  />
                );
              })}
            </div>
          )}

          {!editing && areas.some((fid) => already.has(fid)) && (
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(!!v)} />
              Update existing responsibilities with this coverage
            </label>
          )}

          {/* Advanced — organisational unit, dates and notes. Ordinary
              administration does not need any of this; the unit stays optional. */}
          <Collapsible open={advanced} onOpenChange={setAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-fit px-0 text-xs">
                {advanced ? 'Hide advanced options' : 'Advanced options (organisational unit, dates, notes)'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 grid gap-3 rounded-md border p-3">
              {!customize && (
                <div>
                  <Label className="text-xs">Organisational unit (optional)</Label>
                  <Select value={shared.teamId} onValueChange={(v) => setShared((c) => ({ ...c, teamId: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No unit</SelectItem>
                      {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A unit only groups staff — it never grants a permission and never replaces the area of work.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Effective from</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Effective to (optional)</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CollapsibleContent>
          </Collapsible>


          {!editing && areas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {willWrite.length === 0
                ? 'Every selected area is already assigned — nothing would change.'
                : `${willWrite.length} ${willWrite.length === 1 ? 'responsibility' : 'separate responsibilities'} will be saved together; nothing is saved if any one of them is invalid.`}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-rbac="user_management.edit" onClick={editing ? submitEdit : submitBatch} disabled={!canSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Coverage + team selector for one configuration block. */
function AreaCoverage({
  config, onChange, teams, compact, showTeam,
}: {
  config: AreaConfig;
  onChange: (patch: Partial<AreaConfig>) => void;
  teams: any[];
  compact?: boolean;
  showTeam?: boolean;
}) {
  const activeSectors = useActiveSectors();
  const activeSubSectors = useActiveSubSectors();
  const entities = useSupervisedEntities();

  const options = useMemo<{ id: string; name: string; group?: string }[]>(() => {
    if (config.appliesTo === 'sector')
      return (activeSectors.data || [])
        .slice()
        .sort(
          (a: any, b: any) =>
            SECTOR_GROUP_ORDER.indexOf(a.display_group) - SECTOR_GROUP_ORDER.indexOf(b.display_group) ||
            String(a.name).localeCompare(String(b.name)),
        )
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          group: SECTOR_GROUP_LABELS[s.display_group || 'UNGROUPED'],
        }));
    if (config.appliesTo === 'sub_sector')
      return (activeSubSectors.data || [])
        .filter((s: any) => !config.sectorId || s.sector_id === config.sectorId)
        .map((s: any) => ({ id: s.id, name: s.name }));
    if (config.appliesTo === 'entity') return (entities.data || []).map((s: any) => ({ id: s.id, name: s.name }));
    return [];
  }, [config.appliesTo, config.sectorId, activeSectors.data, activeSubSectors.data, entities.data]);

  const toggle = (id: string) =>
    onChange({ picked: config.picked.includes(id) ? config.picked.filter((x) => x !== id) : [...config.picked, id] });

  return (
    <div className={compact ? 'grid gap-2' : 'grid gap-3'}>
      <div>
        <Label className="text-xs">Applies to</Label>
        <Select
          value={config.appliesTo}
          onValueChange={(v) => onChange({ appliesTo: v as AppliesTo, picked: [] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            <SelectItem value="sector">Sector</SelectItem>
            <SelectItem value="sub_sector">Sub-sector</SelectItem>
            <SelectItem value="entity">Specific entities</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.appliesTo === 'sub_sector' && (
        <div>
          <Label className="text-xs">Sector</Label>
          <Select value={config.sectorId} onValueChange={(v) => onChange({ sectorId: v, picked: [] })}>
            <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
            <SelectContent>
              {(activeSectors.data || []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.appliesTo !== 'all' && (
        <div>
          <Label className="text-xs">Coverage</Label>
          <div className="max-h-48 space-y-1 overflow-auto rounded-md border p-2">
            {options.map((o, i) => (
              <div key={o.id}>
                {o.group && o.group !== options[i - 1]?.group && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                    {o.group}
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={config.picked.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                  {o.name}
                </label>
              </div>
            ))}
            {options.length === 0 && <p className="text-xs text-muted-foreground">Nothing to select.</p>}
          </div>
        </div>
      )}

      {showTeam && (
      <div>
        <Label className="text-xs">Organisational unit (optional)</Label>
        <Select value={config.teamId} onValueChange={(v) => onChange({ teamId: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No unit</SelectItem>
            {teams.filter((t: any) => t.status === 'active').map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}
    </div>
  );
}

/**
 * One selected area of work. The regulator is resolved INDEPENDENTLY for each
 * area so twin-peaks deployments stay correct; nothing ever falls back to the
 * first regulator row.
 */
function AreaRow({
  functionId, name, config, customise, showRegulator, state, teams, onChange, onResolved,
}: {
  functionId: string;
  name: string;
  config: AreaConfig;
  customise: boolean;
  showRegulator: boolean;
  state: string;
  teams: any[];
  onChange: (patch: Partial<AreaConfig>) => void;
  onResolved: (r: Resolved) => void;
}) {
  const resolution = useRegulatorResolution({
    functionId,
    appliesTo: config.appliesTo,
    values: config.picked,
  });
  const regulator = resolution.resolved || resolution.candidates[0] || null;
  const regulatorId = resolution.resolved ? resolution.resolved.id : resolution.candidates.length === 1 ? regulator!.id : '';

  useEffect(() => {
    onResolved({
      regulatorId,
      regulatorName: regulatorId ? regulator?.name || '' : '',
      notConfigured: resolution.notConfigured || !regulatorId,
      reason: resolution.reason,
    });
  }, [regulatorId, resolution.notConfigured, resolution.reason]);

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        <div className="flex items-center gap-2">
          {showRegulator && regulatorId && (
            <span className="text-xs text-muted-foreground">{regulator?.name}</span>
          )}
          <Badge variant={state === 'New' ? 'default' : 'secondary'}>{state}</Badge>
        </div>
      </div>

      {(resolution.notConfigured || !regulatorId) && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="text-xs font-medium text-destructive">REGULATOR COVERAGE NOT CONFIGURED</p>
          <p className="mt-1 text-xs text-muted-foreground">{resolution.reason}</p>
        </div>
      )}

      {customise && (
        <div className="mt-3">
          <AreaCoverage config={config} onChange={onChange} teams={teams} compact showTeam />
        </div>
      )}
    </div>
  );
}
