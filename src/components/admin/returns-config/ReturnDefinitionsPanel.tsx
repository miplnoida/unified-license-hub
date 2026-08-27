/**
 * RDM-ENTITY-001 Wave C — Return Definitions governed CRUD panel.
 * All writes go through `returns_save_definition` / `returns_set_definition_status`.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useReturnDefinitions, useWaveCMutations, FREQUENCY_LABELS, type ReturnDefinition, type ReturnFrequency,
} from '@/hooks/useWaveC';
import { useDefinitionFormRows, useWaveCConfigMutations } from '@/hooks/useWaveCConfig';
import { formatDateOnly } from '@/lib/datetime';
import { Loader2, MoreVertical, Plus, ListChecks } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { DefinitionFormsDrawer } from './DefinitionFormsDrawer';

const FREQUENCIES: ReturnFrequency[] = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'EVENT_DRIVEN', 'AD_HOC'];
const FILING_BASES = ['SOLO', 'CONSOLIDATED', 'BOTH'] as const;

const emptyForm = {
  id: '' as string | undefined,
  code: '', name: '', description: '',
  frequency: 'QUARTERLY' as ReturnFrequency,
  filing_basis: 'SOLO' as typeof FILING_BASES[number],
  consolidation_basis: '', currency_basis: '',
  due_days_after_period_end: 30,
  requires_declaration: true, declaration_text: '',
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: '',
};

export function ReturnDefinitionsPanel({ canWrite }: { canWrite: boolean }) {
  const { data: definitions = [], isLoading } = useReturnDefinitions();
  const { saveDefinition } = useWaveCMutations();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formsDrawerDef, setFormsDrawerDef] = useState<ReturnDefinition | null>(null);
  const [retireTarget, setRetireTarget] = useState<ReturnDefinition | null>(null);

  const isEditing = !!form.id;

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (d: ReturnDefinition) => {
    setForm({
      id: d.id, code: d.code, name: d.name, description: d.description ?? '',
      frequency: d.frequency, filing_basis: d.filing_basis,
      consolidation_basis: d.consolidation_basis ?? '', currency_basis: d.currency_basis ?? '',
      due_days_after_period_end: d.due_days_after_period_end,
      requires_declaration: d.requires_declaration, declaration_text: d.declaration_text ?? '',
      effective_from: d.effective_from?.slice(0, 10) ?? '', effective_to: d.effective_to?.slice(0, 10) ?? '',
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: 'Code and name are required', variant: 'destructive' });
      return;
    }
    try {
      await saveDefinition.mutateAsync({
        id: form.id || undefined,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        frequency: form.frequency,
        filing_basis: form.filing_basis,
        consolidation_basis: form.consolidation_basis.trim() || null,
        currency_basis: form.currency_basis.trim() || null,
        due_days_after_period_end: Number(form.due_days_after_period_end) || 30,
        requires_declaration: form.requires_declaration,
        declaration_text: form.requires_declaration ? (form.declaration_text.trim() || null) : null,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      });
      toast({ title: 'Return definition saved' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canWrite && <Button data-rbac="returns_management.create" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New return definition</Button>}
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Frequency</TableHead>
              <TableHead>Filing basis</TableHead><TableHead>Consolidation</TableHead><TableHead>Currency</TableHead>
              <TableHead>Due days</TableHead><TableHead>Declaration</TableHead><TableHead>Status</TableHead>
              <TableHead>Effective from</TableHead><TableHead>Effective to</TableHead>
              {canWrite && <TableHead className="w-10" />}
            </TableRow></TableHeader>
            <TableBody>
              {definitions.map((d) => (
                <DefinitionRow
                  key={d.id}
                  definition={d}
                  canWrite={canWrite}
                  onEdit={() => openEdit(d)}
                  onForms={() => setFormsDrawerDef(d)}
                  onRetire={() => setRetireTarget(d)}
                />
              ))}
              {definitions.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">No return definitions configured yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit return definition' : 'New return definition'}</DialogTitle>
            <DialogDescription>Definitions describe a filing obligation type; obligation rules decide who owes it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  disabled={isEditing}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="LIQ_MONTHLY"
                />
                {isEditing && <p className="text-xs text-muted-foreground">Code is fixed once a definition exists.</p>}
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as ReturnFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Filing basis</Label>
                <Select value={form.filing_basis} onValueChange={(v) => setForm({ ...form, filing_basis: v as typeof FILING_BASES[number] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FILING_BASES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due days after period end</Label>
                <Input type="number" min={0} value={form.due_days_after_period_end}
                  onChange={(e) => setForm({ ...form, due_days_after_period_end: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Consolidation basis</Label>
                <Input value={form.consolidation_basis} onChange={(e) => setForm({ ...form, consolidation_basis: e.target.value })} placeholder="e.g. GROUP" />
              </div>
              <div className="space-y-1">
                <Label>Currency basis</Label>
                <Input value={form.currency_basis} onChange={(e) => setForm({ ...form, currency_basis: e.target.value })} placeholder="e.g. LOCAL" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Effective from</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Effective to</Label>
                <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Requires declaration</p>
                <p className="text-xs text-muted-foreground">Filer must accept a declaration statement before submitting.</p>
              </div>
              <Switch checked={form.requires_declaration} onCheckedChange={(c) => setForm({ ...form, requires_declaration: c })} />
            </div>
            {form.requires_declaration && (
              <div className="space-y-1">
                <Label>Declaration text</Label>
                <Textarea rows={3} value={form.declaration_text} onChange={(e) => setForm({ ...form, declaration_text: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-rbac="returns_management.edit" onClick={submit} disabled={saveDefinition.isPending}>
              {saveDefinition.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save definition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {formsDrawerDef && (
        <DefinitionFormsDrawer
          definition={formsDrawerDef}
          canWrite={canWrite}
          onClose={() => setFormsDrawerDef(null)}
        />
      )}

      <AlertDialog open={!!retireTarget} onOpenChange={(o) => !o && setRetireTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire "{retireTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Retiring a return definition is irreversible — a retired definition can never be reactivated.
              Existing filings are unaffected but no new obligations will be derived from it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <RetireConfirmAction target={retireTarget} onDone={() => setRetireTarget(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RetireConfirmAction({ target, onDone }: { target: ReturnDefinition | null; onDone: () => void }) {
  const { setDefinitionStatus } = useWaveCConfigMutations();
  const doRetire = async () => {
    if (!target) return;
    try {
      await setDefinitionStatus.mutateAsync({ definitionId: target.id, status: 'RETIRED' });
      toast({ title: 'Return definition retired' });
    } catch (e: any) {
      toast({ title: 'Retire failed', description: e.message, variant: 'destructive' });
    } finally {
      onDone();
    }
  };
  return (
    <AlertDialogAction onClick={doRetire} disabled={setDefinitionStatus.isPending}>
      {setDefinitionStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Retire permanently
    </AlertDialogAction>
  );
}

function DefinitionRow({
  definition, canWrite, onEdit, onForms, onRetire,
}: {
  definition: ReturnDefinition; canWrite: boolean;
  onEdit: () => void; onForms: () => void; onRetire: () => void;
}) {
  const { data: forms = [] } = useDefinitionFormRows(definition.id);
  const { setDefinitionStatus } = useWaveCConfigMutations();

  const setStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await setDefinitionStatus.mutateAsync({ definitionId: definition.id, status });
      toast({ title: `Definition ${status === 'ACTIVE' ? 'activated' : 'suspended'}` });
    } catch (e: any) {
      toast({ title: 'Status change failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs font-medium">{definition.code}</TableCell>
      <TableCell>
        <button type="button" className="text-left hover:underline" onClick={onForms}>{definition.name}</button>
      </TableCell>
      <TableCell>{FREQUENCY_LABELS[definition.frequency] ?? definition.frequency}</TableCell>
      <TableCell>{definition.filing_basis}</TableCell>
      <TableCell>{definition.consolidation_basis ?? '—'}</TableCell>
      <TableCell>{definition.currency_basis ?? '—'}</TableCell>
      <TableCell>{definition.due_days_after_period_end}</TableCell>
      <TableCell>{definition.requires_declaration ? 'Required' : 'No'}</TableCell>
      <TableCell><Badge variant="outline">{definition.status}</Badge></TableCell>
      <TableCell className="whitespace-nowrap">{formatDateOnly(definition.effective_from)}</TableCell>
      <TableCell className="whitespace-nowrap">{definition.effective_to ? formatDateOnly(definition.effective_to) : '—'}</TableCell>
      {canWrite && (
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-rbac="returns_management.edit" onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onForms}><ListChecks className="mr-2 h-4 w-4" />Assigned forms ({forms.length})</DropdownMenuItem>
              {definition.status !== 'ACTIVE' && definition.status !== 'RETIRED' && (
                <DropdownMenuItem data-rbac="returns_management.edit" onClick={() => setStatus('ACTIVE')}>Activate</DropdownMenuItem>
              )}
              {definition.status === 'ACTIVE' && (
                <DropdownMenuItem data-rbac="returns_management.edit" onClick={() => setStatus('SUSPENDED')}>Suspend</DropdownMenuItem>
              )}
              {definition.status !== 'RETIRED' && (
                <DropdownMenuItem data-rbac="returns_management.edit" className="text-destructive" onClick={onRetire}>Retire…</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}
