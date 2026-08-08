import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, PlusCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  AppealDecisionRule, AppealHearingFormat, LicenseAppealPanel as PanelRow,
  useAppealScopes, useLicenseAppealMutations, useLicenseAppealPanels,
} from '@/hooks/useLicenseAppeals';
import { useAllRegulators } from '@/hooks/useRegulators';
import {
  DECISION_RULE_OPTIONS, HEARING_FORMAT_OPTIONS, decisionRuleLabel,
  hearingFormatLabel, isPanelInForce,
} from '@/lib/licenseAppeals';
import { AppealPanelMembersDialog } from '@/components/appeals/AppealPanelMembersDialog';

const NO_REGULATOR = 'none';

export default function LicenseAppealPanels() {
  const { data: panels, isLoading } = useLicenseAppealPanels();
  const { data: scopes } = useAppealScopes();
  const { data: regulators } = useAllRegulators();
  const { savePanel } = useLicenseAppealMutations();

  const [editing, setEditing] = useState<PanelRow | null>(null);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState<PanelRow | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('licensing');
  const [regulatorId, setRegulatorId] = useState<string>(NO_REGULATOR);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [format, setFormat] = useState<AppealHearingFormat>('written');
  const [quorum, setQuorum] = useState('3');
  const [rule, setRule] = useState<AppealDecisionRule>('majority');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const startCreate = () => {
    setEditing(null); setName(''); setDescription(''); setScope('licensing');
    setRegulatorId(NO_REGULATOR); setFrom(''); setTo(''); setFormat('written');
    setQuorum('3'); setRule('majority'); setNotes(''); setIsActive(true); setOpen(true);
  };
  const startEdit = (p: PanelRow) => {
    setEditing(p); setName(p.name); setDescription(p.description || '');
    setScope(p.appeal_scope || 'licensing');
    setRegulatorId(p.regulator_id || NO_REGULATOR);
    setFrom(p.effective_from || ''); setTo(p.effective_to || '');
    setFormat((p.default_hearing_format || 'written') as AppealHearingFormat);
    setQuorum(String(p.quorum ?? 3));
    setRule((p.decision_rule || 'majority') as AppealDecisionRule);
    setNotes(p.notes || ''); setIsActive(p.is_active); setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Panel name is required'); return; }
    const q = Number(quorum);
    if (!Number.isFinite(q) || q < 1) { toast.error('Quorum must be at least 1'); return; }
    if (from && to && to < from) { toast.error('The end date cannot be before the start date'); return; }
    try {
      await savePanel.mutateAsync({
        id: editing?.id,
        name: name.trim(),
        description,
        is_active: isActive,
        appeal_scope: scope,
        regulator_id: regulatorId === NO_REGULATOR ? null : regulatorId,
        effective_from: from || null,
        effective_to: to || null,
        default_hearing_format: format,
        quorum: q,
        decision_rule: rule,
        notes,
      });
      toast.success(editing ? 'Panel updated' : 'Panel created');
      setOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to save panel');
    }
  };

  const scopeLabel = (key: string) =>
    (scopes || []).find((s) => s.scope_key === key)?.label ?? key;
  const regulatorLabel = (id: string | null) =>
    id ? ((regulators || []).find((r) => r.id === id)?.name ?? '—') : 'All regulators';

  const columns: Column<PanelRow>[] = [
    { key: 'name', label: 'Panel', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'appeal_scope', label: 'Scope', render: (r) => scopeLabel(r.appeal_scope) },
    { key: 'regulator_id', label: 'Panel jurisdiction / Regulator', render: (r) => regulatorLabel(r.regulator_id) },
    {
      key: 'effective', label: 'In force',
      render: (r) => `${r.effective_from || 'open'} → ${r.effective_to || 'open'}`,
    },
    { key: 'quorum', label: 'Quorum', render: (r) => r.quorum },
    { key: 'decision_rule', label: 'Decision rule', render: (r) => decisionRuleLabel(r.decision_rule) },
    { key: 'default_hearing_format', label: 'Default hearing', render: (r) => hearingFormatLabel(r.default_hearing_format) },
    {
      key: 'is_active', label: 'Status',
      render: (r) => (
        <Badge variant={isPanelInForce(r) ? 'approved' as never : 'secondary'}>
          {isPanelInForce(r) ? 'In force' : r.is_active ? 'Not in force' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Composition" onClick={() => setComposing(r)}>
            <Users className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => startEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Appeal Panels"
          description="Constitute the panels that hear appeals: scope, period in force, quorum, decision rule and membership."
        />
        <DataTableShell
          columns={columns}
          data={panels || []}
          searchPlaceholder="Search panels..."
          actions={
            <Button size="sm" onClick={startCreate} disabled={isLoading}>
              <PlusCircle className="h-4 w-4 mr-2" /> New panel
            </Button>
          }
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit panel' : 'New appeal panel'}</DialogTitle>
            <DialogDescription>
              These settings govern how the panel sits. Membership is managed separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="panel-name">Panel name *</Label>
              <Input id="panel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Licensing Appeals Panel A" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Appeal scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(scopes || []).map((s) => (
                      <SelectItem key={s.scope_key} value={s.scope_key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Panel jurisdiction / Regulator</Label>
                <Select value={regulatorId} onValueChange={setRegulatorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REGULATOR}>All regulators</SelectItem>
                    {(regulators || []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Scopes which regulator owns this panel — not who sits on it.
                </p>
              </div>
              <div>
                <Label className="text-xs">Effective from</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Effective to</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Default hearing format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as AppealHearingFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEARING_FORMAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quorum</Label>
                <Input type="number" min="1" value={quorum} onChange={(e) => setQuorum(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Decision rule</Label>
                <Select value={rule} onValueChange={(v) => setRule(v as AppealDecisionRule)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DECISION_RULE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="panel-desc">Description</Label>
              <Textarea id="panel-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="panel-notes">Notes</Label>
              <Textarea id="panel-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms of reference, standing directions…" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="panel-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="panel-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={savePanel.isPending}>
              {savePanel.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppealPanelMembersDialog panel={composing} onOpenChange={(o) => !o && setComposing(null)} />
    </DashboardLayout>
  );
}
