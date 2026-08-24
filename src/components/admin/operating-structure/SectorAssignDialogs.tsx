import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useActiveSectors, usePortfolioMutations, useRegulatoryTeams, useStaffDirectory, useStaffPortfolios,
} from '@/hooks/useOperatingStructure';
import { act, NONE } from './shared';
import { useApplicableSectorAreas, useSectorRegulatorId } from './sectorAreas';
import { AccessStatusNote } from './AccessStatusNote';

type Common = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sectorId: string;
  sectorName: string;
  /** Pre-selected person, used when changing an existing person's areas. */
  userId?: string | null;
  onSaved?: () => void;
};

/**
 * Task-specific sector workflows.
 *
 * WHO → WHAT WORK → (WHERE is already known). The sector is fixed, the
 * regulator is derived and never asked for, and the areas of work come from the
 * single applicable-areas resolver. Saving still uses the atomic governed
 * `staff_responsibilities_batch_save` routine, one staff_portfolio per area.
 */
function useSectorSave(sectorId: string) {
  const portfolios = useStaffPortfolios();
  const regulatorId = useSectorRegulatorId(sectorId);
  const { batchSaveResponsibilities } = usePortfolioMutations();

  const activeFor = (userId: string) =>
    (portfolios.data?.portfolios || []).filter((p: any) => p.user_id === userId && p.status === 'active');

  const save = async (opts: {
    userId: string;
    functionIds: string[];
    teamId: string;
    from: string;
    to: string;
    notes: string;
    okMessage: string;
  }) => {
    if (!regulatorId) {
      return act(async () => {
        throw new Error('No regulator is configured for this sector.');
      }, '');
    }
    const held = new Set(activeFor(opts.userId).map((p: any) => p.regulatory_function_id));
    const items = opts.functionIds.map((fid) => ({
      regulatory_function_id: fid,
      regulator_id: regulatorId,
      team_id: opts.teamId === NONE ? null : opts.teamId,
      applies_to: 'sector',
      values: [sectorId],
      effective_from: opts.from ? new Date(opts.from).toISOString() : new Date().toISOString(),
      effective_to: opts.to ? new Date(opts.to).toISOString() : null,
      notes: opts.notes || null,
      mode: held.has(fid) ? 'update' : 'create',
    }));
    return act(async () => {
      const res: any = await batchSaveResponsibilities.mutateAsync({ userId: opts.userId, items });
      if (res && res.ok === false) {
        const first = (res.errors || [])[0];
        throw new Error(
          first ? `${first.function_name ? `${first.function_name}: ` : ''}${first.message}` : 'Nothing was saved.',
        );
      }
    }, opts.okMessage);
  };

  return { save, regulatorId };
}

/** Shared advanced block: organisational unit, effective dates, notes. */
function AdvancedBlock({
  teamId, setTeamId, from, setFrom, to, setTo, notes, setNotes,
}: {
  teamId: string; setTeamId: (v: string) => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
}) {
  const teams = useRegulatoryTeams();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-fit px-0 text-xs">
          {open ? 'Hide advanced options' : 'Advanced options (organisational unit, dates, notes)'}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 grid gap-3 rounded-md border p-3">
        <div>
          <Label className="text-xs">Organisational unit (optional)</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No unit</SelectItem>
              {(teams.data || []).filter((t: any) => t.status === 'active').map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            A unit only groups staff — it never grants a permission.
          </p>
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
      </CollapsibleContent>
    </Collapsible>
  );
}

function PersonSelect({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const staff = useStaffDirectory();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
      <SelectContent>
        {(staff.data || []).map((s: any) => (
          <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Sector → person → full responsibility → Assign lead. Three selections. */
export function SectorLeadDialog({ open, onOpenChange, sectorId, sectorName, onSaved }: Common) {
  const { areasFor } = useApplicableSectorAreas();
  const areas = useMemo(() => areasFor(sectorId), [areasFor, sectorId]);
  const { save } = useSectorSave(sectorId);

  const [person, setPerson] = useState('');
  const [mode, setMode] = useState<'full' | 'specific'>('full');
  const [picked, setPicked] = useState<string[]>([]);
  const [showIncluded, setShowIncluded] = useState(false);
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState(NONE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPerson(''); setMode('full'); setPicked([]); setShowIncluded(false);
    setSearch(''); setTeamId(NONE); setFrom(''); setTo(''); setNotes('');
  }, [open, sectorId]);

  const selected = mode === 'full' ? areas.map((a) => a.id) : picked;
  const filtered = areas.filter(
    (a) => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const submit = async () => {
    setSaving(true);
    const ok = await save({
      userId: person, functionIds: selected, teamId, from, to, notes,
      okMessage: `Sector lead assigned for ${sectorName}`,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); onSaved?.(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Set sector lead</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Sector</Label>
            <p className="text-sm font-medium">{sectorName}</p>
          </div>

          <div>
            <Label className="text-xs">Sector lead</Label>
            <PersonSelect value={person} onChange={setPerson} />
          </div>

          <div>
            <Label className="text-xs">Responsibility</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="mt-1 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="full" /> Full responsibility for this sector
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="specific" /> Select specific areas of work
              </label>
            </RadioGroup>
          </div>

          {mode === 'full' ? (
            <div className="rounded-md border p-2">
              <p className="text-sm">
                Will assign {areas.length} applicable {areas.length === 1 ? 'area' : 'areas'} of work.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="px-0 text-xs"
                onClick={() => setShowIncluded((v) => !v)}
              >
                {showIncluded ? 'Hide included areas' : 'View included areas'}
              </Button>
              {showIncluded && (
                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {areas.map((a) => <p key={a.id}>{a.name}</p>)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 rounded-md border p-2">
              {areas.length > 6 && (
                <Input placeholder="Search areas of work" value={search} onChange={(e) => setSearch(e.target.value)} />
              )}
              <div className="max-h-48 space-y-1 overflow-auto">
                {filtered.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={picked.includes(a.id)}
                      onCheckedChange={() =>
                        setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))
                      }
                    />
                    {a.name}
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground">No area of work matches that search.</p>
                )}
              </div>
            </div>
          )}

          <AccessStatusNote userId={person || null} />

          <AdvancedBlock
            teamId={teamId} setTeamId={setTeamId}
            from={from} setFrom={setFrom} to={to} setTo={setTo}
            notes={notes} setNotes={setNotes}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!person || selected.length === 0 || saving}>Assign lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Person → areas → Add. The sector is fixed; nothing else is asked. */
export function SupportingStaffDialog({
  open, onOpenChange, sectorId, sectorName, userId, onSaved,
}: Common) {
  const { areasFor } = useApplicableSectorAreas();
  const areas = useMemo(() => areasFor(sectorId), [areasFor, sectorId]);
  const { save } = useSectorSave(sectorId);
  const portfolios = useStaffPortfolios();

  const [person, setPerson] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState(NONE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const held = useMemo(() => {
    const target = userId || person;
    return new Set(
      (portfolios.data?.portfolios || [])
        .filter((p: any) => p.user_id === target && p.status === 'active')
        .map((p: any) => p.regulatory_function_id as string),
    );
  }, [portfolios.data, userId, person]);

  useEffect(() => {
    if (!open) return;
    setPerson(userId || '');
    setSearch(''); setTeamId(NONE); setFrom(''); setTo(''); setNotes('');
    setPicked([]);
  }, [open, sectorId, userId]);

  useEffect(() => {
    if (open && userId) setPicked(Array.from(held).filter((id) => areas.some((a) => a.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, portfolios.data]);

  const filtered = areas.filter(
    (a) => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const submit = async () => {
    setSaving(true);
    const ok = await save({
      userId: person, functionIds: picked, teamId, from, to, notes,
      okMessage: userId ? 'Responsibilities updated' : `Supporting staff added to ${sectorName}`,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); onSaved?.(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{userId ? 'Edit areas of work' : 'Add supporting staff'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Sector</Label>
            <p className="text-sm font-medium">{sectorName}</p>
          </div>

          <div>
            <Label className="text-xs">Person</Label>
            <PersonSelect value={person} onChange={setPerson} disabled={!!userId} />
          </div>

          <div>
            <Label className="text-xs">Areas of work</Label>
            <div className="mt-1 space-y-2 rounded-md border p-2">
              {areas.length > 6 && (
                <Input placeholder="Search areas of work" value={search} onChange={(e) => setSearch(e.target.value)} />
              )}
              <div className="max-h-52 space-y-1 overflow-auto">
                {filtered.map((a) => (
                  <label key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={picked.includes(a.id)}
                        onCheckedChange={() =>
                          setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))
                        }
                      />
                      {a.name}
                    </span>
                    {held.has(a.id) && <Badge variant="secondary">Already assigned</Badge>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <AccessStatusNote userId={person || null} />

          <AdvancedBlock
            teamId={teamId} setTeamId={setTeamId}
            from={from} setFrom={setFrom} to={to} setTo={setTo}
            notes={notes} setNotes={setNotes}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!person || picked.length === 0 || saving}>
            {userId ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Responsibility for a sector" — the simple path from People & Responsibilities.
 * Person is already known: choose the sector, then full or selected areas.
 */
export function PersonSectorResponsibilityDialog({
  open, onOpenChange, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  onSaved?: () => void;
}) {
  const sectors = useActiveSectors();
  const [sectorId, setSectorId] = useState('');
  const [mode, setMode] = useState<'full' | 'specific'>('full');
  const [picked, setPicked] = useState<string[]>([]);
  const [teamId, setTeamId] = useState(NONE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { areasFor } = useApplicableSectorAreas();
  const areas = useMemo(() => (sectorId ? areasFor(sectorId) : []), [areasFor, sectorId]);
  const { save } = useSectorSave(sectorId);

  useEffect(() => {
    if (!open) return;
    setSectorId(''); setMode('full'); setPicked([]); setTeamId(NONE);
    setFrom(''); setTo(''); setNotes('');
  }, [open]);

  const selected = mode === 'full' ? areas.map((a) => a.id) : picked;
  const sectorName = (sectors.data || []).find((s: any) => s.id === sectorId)?.name || '';

  const submit = async () => {
    if (!userId) return;
    setSaving(true);
    const ok = await save({
      userId, functionIds: selected, teamId, from, to, notes,
      okMessage: `Responsibility recorded for ${sectorName}`,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); onSaved?.(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Responsibility for a sector</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Sector</Label>
            <Select value={sectorId} onValueChange={(v) => { setSectorId(v); setPicked([]); }}>
              <SelectTrigger><SelectValue placeholder="Select a sector" /></SelectTrigger>
              <SelectContent>
                {(sectors.data || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sectorId && (
            <>
              <div>
                <Label className="text-xs">Responsibility</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="mt-1 gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="full" /> Full responsibility for this sector ({areas.length} areas)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="specific" /> Selected areas of work
                  </label>
                </RadioGroup>
              </div>

              {mode === 'specific' && (
                <div className="max-h-52 space-y-1 overflow-auto rounded-md border p-2">
                  {areas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={picked.includes(a.id)}
                        onCheckedChange={() =>
                          setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))
                        }
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          <AccessStatusNote userId={userId} />

          <AdvancedBlock
            teamId={teamId} setTeamId={setTeamId}
            from={from} setFrom={setFrom} to={to} setTo={setTo}
            notes={notes} setNotes={setNotes}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!sectorId || selected.length === 0 || saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
