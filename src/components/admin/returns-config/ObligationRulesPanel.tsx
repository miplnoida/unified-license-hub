/**
 * RDM-ENTITY-001 Wave C — Obligation Rules governed CRUD + rule tester.
 * Writes go through `returns_save_obligation_rule`; matching logic is never
 * reimplemented client-side — `returns_test_obligation_rule` is the single
 * source of truth for whether a rule applies to an entity.
 */
import { useState } from 'react';
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
import { CheckCircle2, Loader2, Plus, XCircle, FlaskConical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  useObligationRules, useReturnDefinitions, useWaveCMutations, FREQUENCY_LABELS, type ReturnFrequency,
} from '@/hooks/useWaveC';
import {
  useRegulatorOptions, useSectorOptions, useSubSectorOptions, useCategoryOptions,
  useClassificationValueOptions, useLifecycleStageOptions, useWaveCConfigMutations,
  type ObligationTestResult,
} from '@/hooks/useWaveCConfig';
import { EntityPicker, type SelectedEntity } from '@/pages/returns-canonical/EntityPicker';
import { formatDateOnly } from '@/lib/datetime';

const NONE = 'none';
const FREQUENCIES: ReturnFrequency[] = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'EVENT_DRIVEN', 'AD_HOC'];

const emptyForm = {
  id: '' as string | undefined,
  return_definition_id: '', code: '', name: '', description: '',
  regulator_id: NONE, jurisdiction: '', sector_id: NONE, sub_sector_id: NONE, category_id: NONE,
  classification_value_id: NONE, lifecycle_stage_id: NONE,
  requires_active_license: true, priority: 100,
  frequency_override: NONE, due_days_override: '',
  effective_from: new Date().toISOString().slice(0, 10), effective_to: '',
  is_active: true,
};

export function ObligationRulesPanel({ canWrite }: { canWrite: boolean }) {
  const { data: rules = [], isLoading } = useObligationRules();
  const { data: definitions = [] } = useReturnDefinitions();
  const { saveObligationRule } = useWaveCMutations();
  const { data: regulators = [] } = useRegulatorOptions();
  const { data: sectors = [] } = useSectorOptions();
  const { data: subSectors = [] } = useSubSectorOptions();
  const { data: categories = [] } = useCategoryOptions();
  const { data: classificationValues = [] } = useClassificationValueOptions();
  const { data: lifecycleStages = [] } = useLifecycleStageOptions();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [testRule, setTestRule] = useState<{ id: string; name: string } | null>(null);

  const definitionByI = new Map(definitions.map((d) => [d.id, d]));

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (r: typeof rules[number]) => {
    setForm({
      id: r.id, return_definition_id: r.return_definition_id, code: r.code, name: r.name,
      description: r.description ?? '', regulator_id: r.regulator_id ?? NONE,
      jurisdiction: r.jurisdiction ?? '', sector_id: r.sector_id ?? NONE,
      sub_sector_id: r.sub_sector_id ?? NONE, category_id: r.category_id ?? NONE,
      classification_value_id: r.classification_value_id ?? NONE,
      lifecycle_stage_id: r.lifecycle_stage_id ?? NONE,
      requires_active_license: r.requires_active_license, priority: r.priority,
      frequency_override: r.frequency_override ?? NONE,
      due_days_override: r.due_days_override != null ? String(r.due_days_override) : '',
      effective_from: r.effective_from?.slice(0, 10) ?? '', effective_to: r.effective_to?.slice(0, 10) ?? '',
      is_active: r.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.return_definition_id || !form.code.trim() || !form.name.trim()) {
      toast({ title: 'Return definition, code and name are required', variant: 'destructive' });
      return;
    }
    try {
      await saveObligationRule.mutateAsync({
        id: form.id || undefined,
        return_definition_id: form.return_definition_id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        regulator_id: form.regulator_id === NONE ? null : form.regulator_id,
        jurisdiction: form.jurisdiction.trim() || null,
        sector_id: form.sector_id === NONE ? null : form.sector_id,
        sub_sector_id: form.sub_sector_id === NONE ? null : form.sub_sector_id,
        category_id: form.category_id === NONE ? null : form.category_id,
        classification_value_id: form.classification_value_id === NONE ? null : form.classification_value_id,
        lifecycle_stage_id: form.lifecycle_stage_id === NONE ? null : form.lifecycle_stage_id,
        requires_active_license: form.requires_active_license,
        priority: Number(form.priority) || 100,
        frequency_override: form.frequency_override === NONE ? null : form.frequency_override,
        due_days_override: form.due_days_override.trim() === '' ? null : Number(form.due_days_override),
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
        is_active: form.is_active,
      });
      toast({ title: 'Obligation rule saved' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canWrite && (
          <Button data-rbac="returns_management.create" onClick={openCreate} disabled={definitions.length === 0}>
            <Plus className="mr-2 h-4 w-4" />New obligation rule
          </Button>
        )}
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Return definition</TableHead>
              <TableHead>Priority</TableHead><TableHead>Active licence</TableHead>
              <TableHead>Frequency override</TableHead><TableHead>Due days override</TableHead>
              <TableHead>Effective from</TableHead><TableHead>Active</TableHead><TableHead className="w-40" />
            </TableRow></TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {canWrite ? <button className="hover:underline" onClick={() => openEdit(r)}>{r.code}</button> : r.code}
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{definitionByI.get(r.return_definition_id)?.code ?? '—'}</TableCell>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell>{r.requires_active_license ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{r.frequency_override ? FREQUENCY_LABELS[r.frequency_override] : '—'}</TableCell>
                  <TableCell>{r.due_days_override ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateOnly(r.effective_from)}</TableCell>
                  <TableCell><Badge variant="outline">{r.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setTestRule({ id: r.id, name: r.name })}>
                      <FlaskConical className="mr-1.5 h-3.5 w-3.5" />Test rule
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No obligation rules configured yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit obligation rule' : 'New obligation rule'}</DialogTitle>
            <DialogDescription>Rules decide which entities owe a return definition, and may override its frequency or due days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Return definition</Label>
              <Select value={form.return_definition_id} onValueChange={(v) => setForm({ ...form, return_definition_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a return definition" /></SelectTrigger>
                <SelectContent>
                  {definitions.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
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

            <p className="pt-1 text-xs font-medium text-muted-foreground">Applicability dimensions — leave as "Any" to not filter on that dimension</p>
            <div className="grid grid-cols-2 gap-3">
              <LookupSelect label="Regulator" value={form.regulator_id} options={regulators} onChange={(v) => setForm({ ...form, regulator_id: v })} />
              <div className="space-y-1">
                <Label>Jurisdiction</Label>
                <Input value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} placeholder="e.g. DOMESTIC" />
              </div>
              <LookupSelect label="Sector" value={form.sector_id} options={sectors} onChange={(v) => setForm({ ...form, sector_id: v })} />
              <LookupSelect label="Sub-sector" value={form.sub_sector_id} options={subSectors} onChange={(v) => setForm({ ...form, sub_sector_id: v })} />
              <LookupSelect label="Category" value={form.category_id} options={categories} onChange={(v) => setForm({ ...form, category_id: v })} />
              <LookupSelect label="Classification value" value={form.classification_value_id} options={classificationValues} onChange={(v) => setForm({ ...form, classification_value_id: v })} />
              <LookupSelect label="Lifecycle stage" value={form.lifecycle_stage_id} options={lifecycleStages} onChange={(v) => setForm({ ...form, lifecycle_stage_id: v })} />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Requires active licence</span>
                <Switch checked={form.requires_active_license} onCheckedChange={(c) => setForm({ ...form, requires_active_license: c })} />
              </div>
            </div>

            <p className="pt-1 text-xs font-medium text-muted-foreground">Overrides &amp; scheduling</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Priority (lower wins on conflict)</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Frequency override</Label>
                <Select value={form.frequency_override} onValueChange={(v) => setForm({ ...form, frequency_override: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Use definition frequency</SelectItem>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due days override</Label>
                <Input type="number" value={form.due_days_override} onChange={(e) => setForm({ ...form, due_days_override: e.target.value })} placeholder="Use definition value" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Active</span>
                <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
              </div>
              <div className="space-y-1">
                <Label>Effective from</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Effective to</Label>
                <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-rbac="returns_management.edit" onClick={submit} disabled={saveObligationRule.isPending}>
              {saveObligationRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {testRule && <TestRuleDialog rule={testRule} onClose={() => setTestRule(null)} />}
    </div>
  );
}

function LookupSelect({
  label, value, options, onChange,
}: { label: string; value: string; options: { id: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Any</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function TestRuleDialog({ rule, onClose }: { rule: { id: string; name: string }; onClose: () => void }) {
  const { testObligationRule } = useWaveCConfigMutations();
  const [entity, setEntity] = useState<SelectedEntity | null>(null);
  const [result, setResult] = useState<ObligationTestResult | null>(null);

  const runTest = async (e: SelectedEntity) => {
    setEntity(e);
    setResult(null);
    try {
      const r = await testObligationRule.mutateAsync({ ruleId: rule.id, entityId: e.entity_id });
      setResult(r);
    } catch (err: any) {
      toast({ title: 'Test failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test "{rule.name}"</DialogTitle>
          <DialogDescription>
            Runs the governed <code>returns_test_obligation_rule</code> evaluation on the server — this dialog never
            re-implements matching logic.
          </DialogDescription>
        </DialogHeader>

        <EntityPicker value={entity} onSelect={(e) => { setEntity(e); setResult(null); if (e) runTest(e); }} />

        {testObligationRule.isPending && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Evaluating…
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.matches ? 'default' : 'destructive'} className="gap-1">
                {result.matches ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {result.matches ? 'Matches' : 'Does not match'}
              </Badge>
              {result.already_obliged && <Badge variant="outline">Already obliged</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
              <div><span className="text-muted-foreground">Return definition:</span> {result.definition_code} — {result.definition_name}</div>
              <div><span className="text-muted-foreground">Frequency:</span> {FREQUENCY_LABELS[result.frequency as ReturnFrequency] ?? result.frequency} <span className="text-xs text-muted-foreground">({result.frequency_source})</span></div>
              <div><span className="text-muted-foreground">Due days:</span> {result.due_days_after_period_end} <span className="text-xs text-muted-foreground">({result.due_days_source})</span></div>
              <div><span className="text-muted-foreground">Example period end:</span> {formatDateOnly(result.example_period_end)}</div>
              <div><span className="text-muted-foreground">Example due date:</span> {formatDateOnly(result.example_due_date)}</div>
            </div>

            <Table>
              <TableHeader><TableRow><TableHead>Dimension</TableHead><TableHead className="w-20">Pass</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.reasons.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="capitalize">{r.dimension.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{r.pass ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
