/**
 * Programme package details — creation and metadata authoring.
 *
 * Creation asks the server who may create a package, in which supervisory
 * domains, and for which regulator; the browser never widens that. Origin,
 * lifecycle status, ownership and lineage are server-set and are not offered
 * here. Metadata editing exposes only the fields the governed save operation
 * accepts on a draft.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useAssessmentProgrammeCreateOptions, useCreateProgrammeSet, useSaveProgrammeSet,
  type ProgrammeSetDetail,
} from '@/hooks/useSupervisoryAssessmentProgrammes';
import { humanize } from '@/components/admin/supervisory-policy-profile/labels';

/* ------------------------------------------------------------------ create */

export function ProgrammeSetCreateAction({ onCreated }: { onCreated?: (id: string) => void }) {
  const options = useAssessmentProgrammeCreateOptions();
  const create = useCreateProgrammeSet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    code: '', set_version: '1.0', name: '', description: '', domain_code: '',
    effective_from: '', effective_to: '', notes: '', rationale: '', regulator_id: '',
  });

  const o = options.data;
  const regulators = o?.regulators ?? [];
  const selectableCount = o?.selectable_regulator_count ?? regulators.length;
  const soleRegulator = o?.active_regulator ?? (selectableCount === 1 ? regulators[0] ?? null : null);
  const domains = o?.domains ?? [];

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF((p) => ({
      ...p,
      domain_code: p.domain_code || (domains.length === 1 ? domains[0] : ''),
      regulator_id: soleRegulator?.id ?? p.regulator_id,
    }));
  }, [open, domains.length, soleRegulator?.id]);

  if (!o?.can_create) {
    return o?.reason ? (
      <span className="text-xs text-muted-foreground" data-testid="programme-create-refused">{o.reason}</span>
    ) : null;
  }

  const submit = async () => {
    setError(null);
    try {
      const id = await create.mutateAsync({
        payload: {
          code: f.code.trim(), set_version: f.set_version.trim(), name: f.name.trim(),
          description: f.description.trim() || null, domain_code: f.domain_code,
          regulator_id: f.regulator_id || soleRegulator?.id || null,
          effective_from: f.effective_from || null, effective_to: f.effective_to || null,
          notes: f.notes.trim() || null, rationale: f.rationale.trim() || null,
        },
      });
      toast.success('Programme package created in draft.');
      setOpen(false);
      setF({ code: '', set_version: '1.0', name: '', description: '', domain_code: '',
        effective_from: '', effective_to: '', notes: '', rationale: '', regulator_id: '' });
      if (typeof id === 'string') onCreated?.(id);
    } catch (e: any) {
      setError(e?.message ?? 'The package could not be created.');
    }
  };

  const ready = f.code.trim() !== '' && f.name.trim() !== '' && f.domain_code !== ''
    && f.set_version.trim() !== '' && Boolean(f.regulator_id || soleRegulator?.id);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-rbac="aml_supervision.manage_config">
        Create programme package
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a programme package</DialogTitle>
            <DialogDescription>
              The package is created as a regulator-authored draft. It becomes policy only when it is
              submitted, approved and activated.
            </DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ps-code">Package code</Label>
              <Input id="ps-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })}
                placeholder="FSRA-AML-ASSESSMENT-PROGRAMMES" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-version">Version</Label>
              <Input id="ps-version" value={f.set_version} onChange={(e) => setF({ ...f, set_version: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ps-name">Name</Label>
              <Input id="ps-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-domain">Supervisory domain</Label>
              <Select value={f.domain_code} onValueChange={(v) => setF({ ...f, domain_code: v })}>
                <SelectTrigger id="ps-domain"><SelectValue placeholder="Select a domain…" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d} value={d}>{humanize(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Regulator</Label>
              {selectableCount === 0 ? (
                <p className="text-xs text-muted-foreground">{o.regulator_scope_reason}</p>
              ) : soleRegulator && selectableCount === 1 ? (
                <div><Badge variant="secondary" className="font-normal" data-testid="programme-create-regulator">
                  {soleRegulator.name}
                </Badge></div>
              ) : (
                <Select value={f.regulator_id} onValueChange={(v) => setF({ ...f, regulator_id: v })}>
                  <SelectTrigger aria-label="Regulator"><SelectValue placeholder="Select the regulator…" /></SelectTrigger>
                  <SelectContent>
                    {regulators.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-from">Effective from</Label>
              <Input id="ps-from" type="date" value={f.effective_from}
                onChange={(e) => setF({ ...f, effective_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-to">Effective to</Label>
              <Input id="ps-to" type="date" value={f.effective_to}
                onChange={(e) => setF({ ...f, effective_to: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ps-description">Description</Label>
              <Textarea id="ps-description" rows={2} value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ps-notes">Notes</Label>
              <Textarea id="ps-notes" rows={2} value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ps-rationale">Reason</Label>
              <Textarea id="ps-rationale" rows={2} value={f.rationale}
                onChange={(e) => setF({ ...f, rationale: e.target.value })}
                placeholder="Why this package is being created." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!ready || create.isPending} onClick={submit}>Create package</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------- metadata */

export function ProgrammeSetMetadataAction({ set }: { set: ProgrammeSetDetail['set'] }) {
  const save = useSaveProgrammeSet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => ({
    name: set.name ?? '', description: set.description ?? '',
    effective_from: set.effective_from ?? '', effective_to: set.effective_to ?? '',
    notes: set.notes ?? '', rationale: '',
  }), [set]);
  const [f, setF] = useState(initial);

  useEffect(() => { if (open) { setF(initial); setError(null); } }, [open, initial]);

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        setId: set.id,
        payload: {
          name: f.name.trim(), description: f.description.trim(),
          effective_from: f.effective_from || null, effective_to: f.effective_to || null,
          notes: f.notes.trim(), rationale: f.rationale.trim() || null,
        },
      });
      toast.success('Package details saved.');
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? 'The change was refused.');
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit details</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit package details</DialogTitle>
            <DialogDescription>
              The code, version, origin, owning regulator and lifecycle status are part of this
              package's identity and cannot be changed here.
            </DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="psm-name">Name</Label>
              <Input id="psm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="psm-from">Effective from</Label>
              <Input id="psm-from" type="date" value={f.effective_from}
                onChange={(e) => setF({ ...f, effective_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="psm-to">Effective to</Label>
              <Input id="psm-to" type="date" value={f.effective_to}
                onChange={(e) => setF({ ...f, effective_to: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="psm-description">Description</Label>
              <Textarea id="psm-description" rows={2} value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="psm-notes">Notes</Label>
              <Textarea id="psm-notes" rows={2} value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="psm-rationale">Reason</Label>
              <Textarea id="psm-rationale" rows={2} value={f.rationale}
                onChange={(e) => setF({ ...f, rationale: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={f.name.trim() === '' || save.isPending} onClick={submit}>Save details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
