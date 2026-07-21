import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Loader2, Plus, Zap, ToggleLeft, ToggleRight, Hash, Pencil, BookOpen, AlertCircle,
} from 'lucide-react';

// ── Extensibility point ─────────────────────────────────────────────────────
// Add a new entry here (+ one CHECK constraint value in the migration) to
// support another trigger event — no other structural change is required.
const TRIGGER_EVENTS = [
  { value: 'declaration_received', label: 'Received Declaration', conditionType: 'assessment_type' as const },
  { value: 'board_member_added', label: 'Add Board Members', conditionType: 'sector' as const },
  { value: 'director_added', label: 'Add Directors', conditionType: 'sector' as const },
] as const;

type TriggerEventValue = (typeof TRIGGER_EVENTS)[number]['value'];

const ASSESSMENT_TYPES = ['initial', 'renewal', 'change_of_role', 'triggered', 'ongoing_monitoring'] as const;

function triggerEventMeta(value: string) {
  return TRIGGER_EVENTS.find((e) => e.value === value) ?? null;
}

function formatLabel(v: string) {
  return v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SectorRow { id: string; name: string; }
interface ScreeningConfigRow { id: string; display_label: string; key: string; is_active: boolean; }

interface RuleRow {
  id: string;
  name: string | null;
  trigger_event: string;
  assessment_type: string | null;
  sector_id: string | null;
  screening_config_id: string;
  is_active: boolean;
  created_at: string;
  sectors?: { name: string } | null;
  fp_screening_configs?: { display_label: string; key: string } | null;
}

interface RuleFormState {
  name: string;
  trigger_event: TriggerEventValue | '';
  assessment_type: string;
  sector_id: string;
  screening_config_id: string;
  is_active: boolean;
}

const EMPTY_FORM: RuleFormState = {
  name: '',
  trigger_event: '',
  assessment_type: '',
  sector_id: '',
  screening_config_id: '',
  is_active: true,
};

// ── Badge helpers ────────────────────────────────────────────────────────────

function activeBadge(isActive: boolean) {
  return isActive ? (
    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Active
    </Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />Inactive
    </Badge>
  );
}

function triggerEventBadge(value: string) {
  const meta = triggerEventMeta(value);
  return (
    <Badge variant="outline" className="text-xs font-medium">
      {meta?.label ?? formatLabel(value)}
    </Badge>
  );
}

function conditionSummary(rule: RuleRow) {
  const meta = triggerEventMeta(rule.trigger_event);
  if (meta?.conditionType === 'assessment_type') {
    return rule.assessment_type ? formatLabel(rule.assessment_type) : 'Any assessment type';
  }
  if (meta?.conditionType === 'sector') {
    return rule.sectors?.name ?? 'Any sector';
  }
  return '—';
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string | number; accent: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg p-2.5 ${accent}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rule Dialog ──────────────────────────────────────────────────────────────

function RuleDialog({
  open, onOpenChange, initial, onSave, isPending, mode, sectors, sectorsLoading, screeningConfigs, screeningConfigsLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: RuleFormState;
  onSave: (form: RuleFormState) => void;
  isPending: boolean;
  mode: 'add' | 'edit';
  sectors: SectorRow[];
  sectorsLoading: boolean;
  screeningConfigs: ScreeningConfigRow[];
  screeningConfigsLoading: boolean;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);

  useEffect(() => { setForm(initial); }, [initial]);

  const setField = <K extends keyof RuleFormState>(k: K, v: RuleFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const meta = triggerEventMeta(form.trigger_event);
  const canSubmit = !!(form.trigger_event && form.screening_config_id);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setForm(initial); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add Automatic Screening Rule' : 'Edit Automatic Screening Rule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label>Rule Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Sanctions check on declaration received"
              autoComplete="off"
            />
          </div>

          <div>
            <Label>Trigger Event <span className="text-red-500">*</span></Label>
            <Select
              value={form.trigger_event}
              onValueChange={(v) => setField('trigger_event', v as TriggerEventValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select event…" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {meta?.conditionType === 'assessment_type' && (
            <div>
              <Label>Assessment Type</Label>
              <Select
                value={form.assessment_type || '__any__'}
                onValueChange={(v) => setField('assessment_type', v === '__any__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any assessment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any assessment type</SelectItem>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {meta?.conditionType === 'sector' && (
            <div>
              <Label>Licensee Sector</Label>
              {sectorsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sectors…
                </div>
              ) : (
                <Select
                  value={form.sector_id || '__any__'}
                  onValueChange={(v) => setField('sector_id', v === '__any__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any sector" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any sector</SelectItem>
                    {sectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                This trigger isn't wired to a live action yet — configure it now so it's ready once that workflow ships.
              </p>
            </div>
          )}

          <Separator />

          <div>
            <Label>Screening Process <span className="text-red-500">*</span></Label>
            {screeningConfigsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading screening processes…
              </div>
            ) : (
              <Select value={form.screening_config_id} onValueChange={(v) => setField('screening_config_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select screening process…" />
                </SelectTrigger>
                <SelectContent>
                  {screeningConfigs.length === 0 && (
                    <SelectItem value="__none__" disabled>No screening configurations found</SelectItem>
                  )}
                  {screeningConfigs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_label || c.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="rule-active"
              checked={form.is_active}
              onCheckedChange={(v) => setField('is_active', v)}
            />
            <Label htmlFor="rule-active" className="cursor-pointer font-normal">
              {form.is_active ? 'Active' : 'Inactive'}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)} disabled={isPending || !canSubmit}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'add' ? 'Create Rule' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function AutoScreeningRulesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('__all__');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RuleRow | null>(null);

  const { data: sectors = [], isLoading: sectorsLoading } = useQuery({
    queryKey: ['sectors_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
  });

  const { data: screeningConfigs = [], isLoading: screeningConfigsLoading } = useQuery({
    queryKey: ['fp_screening_configs_active_dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_configs')
        .select('id, display_label, key, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScreeningConfigRow[];
    },
  });

  const { data: rules, isLoading, isError, error } = useQuery({
    queryKey: ['fp_screening_execution_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_execution_rules' as any)
        .select('*, sectors(name), fp_screening_configs(display_label, key)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as RuleRow[];
    },
  });

  const totalRules = rules?.length ?? 0;
  const activeRules = rules?.filter((r) => r.is_active).length ?? 0;
  const eventsCovered = new Set((rules ?? []).map((r) => r.trigger_event)).size;

  const filtered = (rules ?? []).filter((r) => {
    if (showActiveOnly && !r.is_active) return false;
    if (eventFilter !== '__all__' && r.trigger_event !== eventFilter) return false;
    return true;
  });

  const addRule = useMutation({
    mutationFn: async (form: RuleFormState) => {
      if (!form.trigger_event) throw new Error('Trigger event is required.');
      if (!form.screening_config_id) throw new Error('Screening process is required.');
      const { error } = await supabase.from('fp_screening_execution_rules' as any).insert({
        name: form.name.trim() || null,
        trigger_event: form.trigger_event,
        assessment_type: form.assessment_type || null,
        sector_id: form.sector_id || null,
        screening_config_id: form.screening_config_id,
        is_active: form.is_active,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rule created.');
      qc.invalidateQueries({ queryKey: ['fp_screening_execution_rules'] });
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create rule.'),
  });

  const editRule = useMutation({
    mutationFn: async (form: RuleFormState) => {
      if (!editTarget) return;
      if (!form.trigger_event) throw new Error('Trigger event is required.');
      if (!form.screening_config_id) throw new Error('Screening process is required.');
      const { error } = await supabase
        .from('fp_screening_execution_rules' as any)
        .update({
          name: form.name.trim() || null,
          trigger_event: form.trigger_event,
          assessment_type: form.assessment_type || null,
          sector_id: form.sector_id || null,
          screening_config_id: form.screening_config_id,
          is_active: form.is_active,
        })
        .eq('id', editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rule updated.');
      qc.invalidateQueries({ queryKey: ['fp_screening_execution_rules'] });
      setEditOpen(false);
      setEditTarget(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update rule.'),
  });

  function openEdit(rule: RuleRow) {
    setEditTarget(rule);
    setEditOpen(true);
  }

  function editInitial(): RuleFormState {
    if (!editTarget) return EMPTY_FORM;
    return {
      name: editTarget.name ?? '',
      trigger_event: (editTarget.trigger_event as TriggerEventValue) ?? '',
      assessment_type: editTarget.assessment_type ?? '',
      sector_id: editTarget.sector_id ?? '',
      screening_config_id: editTarget.screening_config_id,
      is_active: editTarget.is_active,
    };
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Configure which screening process runs automatically when a business event occurs — e.g. running a sanctions
          check as soon as a declaration is received for a particular assessment type.
        </p>
        <Button data-rbac="fit_and_proper_screening.create" onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Zap} label="Total Rules" value={totalRules} accent="bg-blue-50 text-blue-600" />
        <StatCard icon={ToggleRight} label="Active Rules" value={activeRules} accent="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Hash} label="Events Covered" value={eventsCovered} accent="bg-violet-50 text-violet-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={showActiveOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowActiveOnly((v) => !v)}
          className="gap-1.5"
        >
          {showActiveOnly ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {showActiveOnly ? 'Active Only' : 'All Rules'}
        </Button>

        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue placeholder="All trigger events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All trigger events</SelectItem>
            {TRIGGER_EVENTS.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(showActiveOnly || eventFilter !== '__all__') && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { setShowActiveOnly(false); setEventFilter('__all__'); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Automatic Screening Rules
            {filtered.length !== totalRules && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                showing {filtered.length} of {totalRules}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="flex items-center gap-2 py-16 px-6 text-red-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">
                Failed to load rules: {(error as any)?.message ?? 'Unknown error'}
              </span>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading rules…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {totalRules === 0
                ? 'No rules defined yet. Use "Add Rule" to map a trigger event to a screening process.'
                : 'No rules match the current filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Trigger Event</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Screening Process</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <span className="font-medium text-sm">
                          {rule.name ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                      </TableCell>
                      <TableCell>{triggerEventBadge(rule.trigger_event)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{conditionSummary(rule)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {rule.fp_screening_configs?.display_label ?? rule.fp_screening_configs?.key ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>{activeBadge(rule.is_active)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(rule.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <Button data-rbac="fit_and_proper_screening.edit"
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 h-7 px-2"
                          onClick={() => openEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-blue-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-blue-900">
            <BookOpen className="h-4 w-4 text-blue-600" />
            Rule Application Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Separator className="mb-3 bg-blue-100" />
          <ul className="space-y-1.5 text-sm text-blue-700">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              Only <strong>Active</strong> rules are evaluated. A rule with no assessment type / sector set applies broadly.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <strong>Received Declaration</strong> rules run automatically today, immediately after a declaration is submitted.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <strong>Add Board Members</strong> / <strong>Add Directors</strong> rules can be configured now; they will
              take effect automatically once that workflow is connected.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              Multiple rules can target different screening processes for different events and sectors.
            </li>
          </ul>
        </CardContent>
      </Card>

      <RuleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        onSave={(form) => addRule.mutate(form)}
        isPending={addRule.isPending}
        mode="add"
        sectors={sectors}
        sectorsLoading={sectorsLoading}
        screeningConfigs={screeningConfigs}
        screeningConfigsLoading={screeningConfigsLoading}
      />

      {editTarget && (
        <RuleDialog
          open={editOpen}
          onOpenChange={(v) => { setEditOpen(v); if (!v) setEditTarget(null); }}
          initial={editInitial()}
          onSave={(form) => editRule.mutate(form)}
          isPending={editRule.isPending}
          mode="edit"
          sectors={sectors}
          sectorsLoading={sectorsLoading}
          screeningConfigs={screeningConfigs}
          screeningConfigsLoading={screeningConfigsLoading}
        />
      )}
    </div>
  );
}
