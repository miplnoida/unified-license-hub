import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  usePortfolioMutations, useRegulatoryFunctions, useRegulatoryTeams,
  SECTOR_GROUP_LABELS, useActiveSectors, useActiveSubSectors, useSectors, useStaffDirectory, useStaffPortfolios, useSubSectors, useSupervisedEntities,
} from '@/hooks/useOperatingStructure';
import { act, NONE } from './shared';
import { useRegulatorResolution } from './regulatorResolution';


type AppliesTo = 'all' | 'sector' | 'sub_sector' | 'entity';

export interface ResponsibilityDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  /** Existing responsibility to edit, or null to add a new one. */
  portfolioId?: string | null;
  /** Pre-selected area of work and place, used when assigning from Coverage. */
  preset?: { functionId?: string; sectorId?: string; subSectorId?: string; teamId?: string };
  onSaved?: () => void;
}

/**
 * One focused dialog for recording WHAT a person is responsible for and WHERE
 * that responsibility applies. Persisted through the governed staff
 * responsibility routines — recording a responsibility never grants a
 * permission, it only narrows where existing permissions apply.
 */
export function ResponsibilityDialog({
  open, onOpenChange, userId, portfolioId, preset, onSaved,
}: ResponsibilityDialogProps) {
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const sectors = useSectors();
  const subSectors = useSubSectors();
  const activeSectors = useActiveSectors();
  const activeSubSectors = useActiveSubSectors();
  const entities = useSupervisedEntities();
  const portfolios = useStaffPortfolios();
  const { savePortfolio, addScope, removeScope } = usePortfolioMutations();


  const existing = useMemo(
    () => (portfolios.data?.portfolios || []).find((p: any) => p.id === portfolioId) || null,
    [portfolios.data, portfolioId],
  );
  const existingScopes = useMemo(
    () => (portfolios.data?.scopes || []).filter((s: any) => s.portfolio_id === portfolioId),
    [portfolios.data, portfolioId],
  );

  const staff = useStaffDirectory();
  const [personId, setPersonId] = useState('');
  // Never defaulted to the first regulator record: this only ever holds an
  // existing saved value or the regulator derived from the chosen coverage.
  const [chosenRegulatorId, setChosenRegulatorId] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [appliesTo, setAppliesTo] = useState<AppliesTo>('all');
  const [sectorId, setSectorId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [teamId, setTeamId] = useState(NONE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const targetUser = userId || existing?.user_id || personId;

  useEffect(() => {
    if (!open) return;
    setChosenRegulatorId(existing?.regulator_id || '');

    setFunctionId(existing?.regulatory_function_id || preset?.functionId || '');
    setTeamId(existing?.team_id || preset?.teamId || NONE);
    setFrom(existing?.effective_from ? String(existing.effective_from).slice(0, 10) : '');
    setTo(existing?.effective_to ? String(existing.effective_to).slice(0, 10) : '');
    setNotes(existing?.notes || '');

    if (existingScopes.length) {
      const kind = existingScopes[0].scope_kind as AppliesTo;
      setAppliesTo(kind);
      if (kind === 'sector') setPicked(existingScopes.map((s: any) => s.sector_id));
      else if (kind === 'sub_sector') {
        setPicked(existingScopes.map((s: any) => s.sub_sector_id));
        const first = (subSectors.data || []).find((s: any) => s.id === existingScopes[0].sub_sector_id);
        setSectorId(first?.sector_id || '');
      } else setPicked(existingScopes.map((s: any) => s.entity_id));
    } else if (preset?.subSectorId) {
      setAppliesTo('sub_sector');
      setPicked([preset.subSectorId]);
      setSectorId(preset.sectorId || '');
    } else if (preset?.sectorId) {
      setAppliesTo('sector');
      setPicked([preset.sectorId]);
      setSectorId(preset.sectorId);
    } else {
      setAppliesTo('all');
      setPicked([]);
      setSectorId('');
    }
  }, [open, portfolioId, existingScopes.length, preset?.functionId]);

  // Regulator is derived from coverage + area of work, never picked from a list
  // of every regulator record.
  const resolution = useRegulatorResolution({
    functionId: functionId || undefined,
    appliesTo,
    values: picked,
  });
  const regulatorId = useMemo(() => {
    if (resolution.resolved) return resolution.resolved.id;
    if (chosenRegulatorId && resolution.candidates.some((c) => c.id === chosenRegulatorId))
      return chosenRegulatorId;
    return '';
  }, [resolution.resolved, resolution.candidates, chosenRegulatorId]);
  const derivedName =
    resolution.resolved?.name ||
    resolution.candidates.find((c) => c.id === regulatorId)?.name ||
    '';


  const options = useMemo<{ id: string; name: string; group?: string }[]>(() => {
    if (appliesTo === 'sector')
      return (activeSectors.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        group: SECTOR_GROUP_LABELS[s.display_group || 'UNGROUPED'],
      }));
    if (appliesTo === 'sub_sector')
      return (activeSubSectors.data || [])
        .filter((s: any) => !sectorId || s.sector_id === sectorId)
        .map((s: any) => ({ id: s.id, name: s.name }));
    if (appliesTo === 'entity') return (entities.data || []).map((s: any) => ({ id: s.id, name: s.name }));
    return [];
  }, [appliesTo, sectorId, activeSectors.data, activeSubSectors.data, entities.data]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!targetUser || !functionId || !regulatorId) return;
    const ok = await act(async () => {
      const saved: any = await savePortfolio.mutateAsync({
        id: portfolioId || null,
        userId: targetUser,
        regulatorId,
        functionId,
        teamId: teamId === NONE ? null : teamId,
        effectiveFrom: from ? new Date(from).toISOString() : existing?.effective_from || new Date().toISOString(),
        effectiveTo: to ? new Date(to).toISOString() : null,
        notes: notes || null,
      });
      const id: string =
        typeof saved === 'string' ? saved : saved?.id || saved?.portfolio_id || portfolioId || '';

      // Remove coverage the administrator deselected, then add what is new.
      for (const s of existingScopes) {
        const value = s.scope_kind === 'sector' ? s.sector_id : s.scope_kind === 'sub_sector' ? s.sub_sector_id : s.entity_id;
        if (appliesTo === 'all' || s.scope_kind !== appliesTo || !picked.includes(value)) {
          await removeScope.mutateAsync({ scopeId: s.id });
        }
      }
      if (appliesTo !== 'all' && id) {
        const already = new Set(
          existingScopes
            .filter((s: any) => s.scope_kind === appliesTo)
            .map((s: any) => (appliesTo === 'sector' ? s.sector_id : appliesTo === 'sub_sector' ? s.sub_sector_id : s.entity_id)),
        );
        for (const value of picked) {
          if (already.has(value)) continue;
          await addScope.mutateAsync({
            portfolioId: id,
            scopeKind: appliesTo,
            sectorId: appliesTo === 'sector' ? value : null,
            subSectorId: appliesTo === 'sub_sector' ? value : null,
            entityId: appliesTo === 'entity' ? value : null,
          });
        }
      }
    }, portfolioId ? 'Responsibility updated' : 'Responsibility added');
    if (ok) {
      onOpenChange(false);
      onSaved?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{portfolioId ? 'Edit responsibility' : 'Add responsibility'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {!userId && !portfolioId && (
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

          {resolution.singleRegulatorDeployment ? (
            derivedName ? (
              <p className="text-xs text-muted-foreground">
                Regulator: <span className="font-medium text-foreground">{derivedName}</span>
              </p>
            ) : null
          ) : (
            <div>
              <Label className="text-xs">Regulator</Label>
              {resolution.candidates.length > 1 ? (
                <>
                  <Select value={regulatorId} onValueChange={setChosenRegulatorId}>
                    <SelectTrigger><SelectValue placeholder="Select the responsible regulator" /></SelectTrigger>
                    <SelectContent>
                      {resolution.candidates.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">{resolution.reason}</p>
                </>
              ) : (
                <>
                  <Input readOnly value={derivedName} placeholder="Derived from the selected coverage" />
                  <p className="mt-1 text-xs text-muted-foreground">{resolution.reason}</p>
                </>
              )}
            </div>
          )}

          {resolution.notConfigured && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">REGULATOR COVERAGE NOT CONFIGURED</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No active regulator mandate covers this area of work and coverage, so this
                responsibility cannot be recorded. Configure the mandate in Advanced authority
                settings on the Operating Structure page, then try again.
              </p>
            </div>
          )}


          <div>
            <Label className="text-xs">Area of work</Label>
            <Select value={functionId} onValueChange={setFunctionId}>
              <SelectTrigger><SelectValue placeholder="Select area of work" /></SelectTrigger>
              <SelectContent>
                {(functions.data || []).filter((f: any) => f.status === 'active').map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Applies to</Label>
            <Select value={appliesTo} onValueChange={(v) => { setAppliesTo(v as AppliesTo); setPicked([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sectors</SelectItem>
                <SelectItem value="sector">Sector</SelectItem>
                <SelectItem value="sub_sector">Sub-sector</SelectItem>
                <SelectItem value="entity">Specific entities</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {appliesTo === 'sub_sector' && (
            <div>
              <Label className="text-xs">Sector</Label>
              <Select value={sectorId} onValueChange={(v) => { setSectorId(v); setPicked([]); }}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {(activeSectors.data || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {appliesTo !== 'all' && (
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
                    <Checkbox checked={picked.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                    {o.name}
                  </label>
                  </div>
                ))}
                {options.length === 0 && <p className="text-xs text-muted-foreground">Nothing to select.</p>}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Team (optional)</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No team</SelectItem>
                {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!targetUser || !functionId || !regulatorId || (appliesTo !== 'all' && picked.length === 0)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
