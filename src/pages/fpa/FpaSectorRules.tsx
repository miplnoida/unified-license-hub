import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Layers,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Pencil,
  Hash,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_TYPES = [
  'director', 'chairperson', 'ceo', 'cfo', 'key_person',
  'controller', 'shareholder', 'senior_manager', 'trustee', 'other',
] as const;

const PRIORITIES = ['high', 'medium', 'low'] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface SectorRow { id: string; name: string; }
interface SubSectorRow { id: string; sector_id: string; name: string; }

interface RuleRow {
  id: string;
  name: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  role_type: string | null;
  criteria: any;
  version: number | null;
  is_active: boolean | null;
  created_at: string;
  sectors?: { name: string } | null;
  sub_sectors?: { name: string } | null;
}

interface CriteriaForm {
  description: string;
  priority: string;
  probity_score_min: string;
  character_assessment_required: boolean;
  qualification_required: boolean;
  background_check_required: boolean;
  declaration_required: boolean;
}

interface RuleFormState {
  name: string;
  sector_id: string;
  sub_sector_id: string;
  role_type: string;
  version: number;
  is_active: boolean;
  criteria: CriteriaForm;
}

const EMPTY_CRITERIA: CriteriaForm = {
  description: '',
  priority: 'medium',
  probity_score_min: '',
  character_assessment_required: false,
  qualification_required: false,
  background_check_required: false,
  declaration_required: false,
};

const EMPTY_FORM: RuleFormState = {
  name: '',
  sector_id: '',
  sub_sector_id: '',
  role_type: '',
  version: 1,
  is_active: true,
  criteria: { ...EMPTY_CRITERIA },
};

// ── Criteria helpers ───────────────────────────────────────────────────────────

function parseCriteriaToForm(criteria: any): CriteriaForm {
  if (!criteria || typeof criteria !== 'object') {
    return { ...EMPTY_CRITERIA, description: typeof criteria === 'string' ? criteria : '' };
  }
  return {
    description: criteria.description ?? '',
    priority: criteria.priority ?? 'medium',
    probity_score_min: criteria.probity_score_min != null ? String(criteria.probity_score_min) : '',
    character_assessment_required: criteria.character_assessment_required ?? false,
    qualification_required: criteria.qualification_required ?? false,
    background_check_required: criteria.background_check_required ?? false,
    declaration_required: criteria.declaration_required ?? false,
  };
}

function buildCriteriaPayload(form: CriteriaForm): object {
  const payload: Record<string, any> = { priority: form.priority };
  if (form.description.trim()) payload.description = form.description.trim();
  const score = parseFloat(form.probity_score_min);
  if (!isNaN(score)) payload.probity_score_min = score;
  if (form.character_assessment_required) payload.character_assessment_required = true;
  if (form.qualification_required) payload.qualification_required = true;
  if (form.background_check_required) payload.background_check_required = true;
  if (form.declaration_required) payload.declaration_required = true;
  return payload;
}

function formatCriteriaPreview(criteria: any): string {
  if (!criteria || typeof criteria !== 'object') return '—';
  const parts: string[] = [];
  if (criteria.description) parts.push(String(criteria.description).slice(0, 60));
  if (criteria.probity_score_min != null) parts.push(`Min score: ${criteria.probity_score_min}`);
  const flags = [
    criteria.character_assessment_required && 'Character',
    criteria.qualification_required && 'Qualification',
    criteria.background_check_required && 'Background',
    criteria.declaration_required && 'Declaration',
  ].filter(Boolean);
  if (flags.length) parts.push(`Requires: ${(flags as string[]).join(', ')}`);
  return parts.join(' · ').slice(0, 100) || '—';
}

function formatCriteriaFull(criteria: any): string {
  if (!criteria) return '';
  try { return JSON.stringify(criteria, null, 2); } catch { return String(criteria); }
}

// ── Badge helpers ──────────────────────────────────────────────────────────────

function activeBadge(is_active: boolean | null) {
  return is_active ? (
    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Active
    </Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />Inactive
    </Badge>
  );
}

function priorityBadge(priority: string | undefined) {
  if (!priority) return <span className="text-muted-foreground text-sm">—</span>;
  if (priority === 'high')
    return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs capitalize">High</Badge>;
  if (priority === 'medium')
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs capitalize">Medium</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs capitalize">Low</Badge>;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

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

// ── Rule Dialog ────────────────────────────────────────────────────────────────

function RuleDialog({
  open, onOpenChange, initial, onSave, isPending, mode, sectors, subSectors, sectorsLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: RuleFormState;
  onSave: (form: RuleFormState) => void;
  isPending: boolean;
  mode: 'add' | 'edit';
  sectors: SectorRow[];
  subSectors: SubSectorRow[];
  sectorsLoading: boolean;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);

  useEffect(() => { setForm(initial); }, [initial]);

  const setField = <K extends keyof RuleFormState>(k: K, v: RuleFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setCriteria = <K extends keyof CriteriaForm>(k: K, v: CriteriaForm[K]) =>
    setForm((f) => ({ ...f, criteria: { ...f.criteria, [k]: v } }));

  const filteredSubSectors = subSectors.filter((s) => s.sector_id === form.sector_id);
  const canSubmit = !!(form.name.trim() && form.sector_id);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setForm(initial); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add Sector Decision Rule' : 'Edit Sector Decision Rule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Basic info ── */}
          <div>
            <Label>Rule Name <span className="text-red-500">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Banking Director — Enhanced Probity"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sector <span className="text-red-500">*</span></Label>
              {sectorsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sectors…
                </div>
              ) : (
                <Select
                  value={form.sector_id}
                  onValueChange={(v) => { setField('sector_id', v); setField('sub_sector_id', ''); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sector…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.length === 0 && (
                      <SelectItem value="__none__" disabled>No sectors found</SelectItem>
                    )}
                    {sectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Sub-Sector</Label>
              <Select
                value={form.sub_sector_id || '__none__'}
                onValueChange={(v) => setField('sub_sector_id', v === '__none__' ? '' : v)}
                disabled={!form.sector_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.sector_id ? 'Select sub-sector…' : 'Select sector first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (applies to all)</SelectItem>
                  {filteredSubSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.sector_id && filteredSubSectors.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No sub-sectors for this sector.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Role Type</Label>
              <Select
                value={form.role_type || '__none__'}
                onValueChange={(v) => setField('role_type', v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any role</SelectItem>
                  {ROLE_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Version</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.version}
                onChange={(e) => setField('version', parseFloat(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-10">
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
          </div>

          <Separator />

          {/* ── Criteria builder ── */}
          <div>
            <p className="text-sm font-semibold mb-3">Rule Criteria</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Priority <span className="text-red-500">*</span></Label>
                <Select
                  value={form.criteria.priority}
                  onValueChange={(v) => setCriteria('priority', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Min. Probity Score{' '}
                  <span className="text-xs font-normal text-muted-foreground">(0–100, optional)</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 70"
                  value={form.criteria.probity_score_min}
                  onChange={(e) => setCriteria('probity_score_min', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <Label>Description / Rationale</Label>
              <Textarea
                rows={3}
                placeholder="Explain the reasoning or legal basis for this rule…"
                value={form.criteria.description}
                onChange={(e) => setCriteria('description', e.target.value)}
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Required Checks
              </p>
              {(
                [
                  ['character_assessment_required', 'Character Assessment required'],
                  ['qualification_required', 'Qualification / Certification required'],
                  ['background_check_required', 'Background / Criminal Check required'],
                  ['declaration_required', 'Statutory Declaration required'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <Switch
                    id={key}
                    checked={form.criteria[key] as boolean}
                    onCheckedChange={(v) => setCriteria(key, v)}
                  />
                  <Label htmlFor={key} className="cursor-pointer font-normal text-sm">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function FpaSectorRules() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('__all__');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RuleRow | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: sectors = [], isLoading: sectorsLoading } = useQuery({
    queryKey: ['sectors_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
  });

  const { data: subSectors = [] } = useQuery({
    queryKey: ['sub_sectors_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sub_sectors').select('id, sector_id, name').order('name');
      if (error) throw error;
      return (data ?? []) as SubSectorRow[];
    },
  });

  const { data: rules, isLoading, isError, error } = useQuery({
    queryKey: ['fp_sector_decision_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_sector_decision_rules')
        .select('*, sectors(name), sub_sectors(name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as RuleRow[];
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalRules = rules?.length ?? 0;
  const activeRules = rules?.filter((r) => r.is_active).length ?? 0;
  const sectorsCovered = new Set((rules ?? []).map((r) => r.sector_id).filter(Boolean)).size;
  const mostRecentVersion = (() => {
    if (!rules?.length) return '—';
    const versions = rules.map((r) => r.version).filter((v): v is number => v !== null);
    return versions.length ? String(Math.max(...versions)) : '—';
  })();

  const distinctRoleTypes = Array.from(
    new Set((rules ?? []).map((r) => r.role_type).filter(Boolean) as string[])
  ).sort();

  const filtered = (rules ?? []).filter((r) => {
    if (showActiveOnly && !r.is_active) return false;
    if (roleFilter !== '__all__' && r.role_type !== roleFilter) return false;
    return true;
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addRule = useMutation({
    mutationFn: async (form: RuleFormState) => {
      if (!form.sector_id) throw new Error('Sector is required.');
      const { error } = await supabase.from('fp_sector_decision_rules').insert({
        name: form.name.trim(),
        sector_id: form.sector_id,
        sub_sector_id: form.sub_sector_id || null,
        role_type: form.role_type || null,
        version: form.version,
        is_active: form.is_active,
        criteria: buildCriteriaPayload(form.criteria),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rule created.');
      qc.invalidateQueries({ queryKey: ['fp_sector_decision_rules'] });
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create rule.'),
  });

  const editRule = useMutation({
    mutationFn: async (form: RuleFormState) => {
      if (!editTarget) return;
      if (!form.sector_id) throw new Error('Sector is required.');
      const { error } = await supabase
        .from('fp_sector_decision_rules')
        .update({
          name: form.name.trim(),
          sector_id: form.sector_id,
          sub_sector_id: form.sub_sector_id || null,
          role_type: form.role_type || null,
          version: form.version,
          is_active: form.is_active,
          criteria: buildCriteriaPayload(form.criteria),
        })
        .eq('id', editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rule updated.');
      qc.invalidateQueries({ queryKey: ['fp_sector_decision_rules'] });
      setEditOpen(false);
      setEditTarget(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update rule.'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openEdit(rule: RuleRow) {
    setEditTarget(rule);
    setEditOpen(true);
  }

  function editInitial(): RuleFormState {
    if (!editTarget) return EMPTY_FORM;
    return {
      name: editTarget.name ?? '',
      sector_id: editTarget.sector_id ?? '',
      sub_sector_id: editTarget.sub_sector_id ?? '',
      role_type: editTarget.role_type ?? '',
      version: editTarget.version ?? 1,
      is_active: editTarget.is_active ?? true,
      criteria: parseCriteriaToForm(editTarget.criteria),
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Sector Decision Rules"
          description="Sector-specific Fit & Proper criteria and decision logic — FPA-010"
          actions={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Layers} label="Total Rules" value={totalRules} accent="bg-blue-50 text-blue-600" />
          <StatCard icon={ToggleRight} label="Active Rules" value={activeRules} accent="bg-emerald-50 text-emerald-600" />
          <StatCard icon={Hash} label="Sectors Covered" value={sectorsCovered} accent="bg-violet-50 text-violet-600" />
          <StatCard icon={CalendarDays} label="Latest Version" value={mostRecentVersion} accent="bg-amber-50 text-amber-600" />
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

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All role types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All role types</SelectItem>
              {distinctRoleTypes.map((rt) => (
                <SelectItem key={rt} value={rt}>{rt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(showActiveOnly || roleFilter !== '__all__') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setShowActiveOnly(false); setRoleFilter('__all__'); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Decision Rules
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
                  ? 'No rules defined yet. Use "Add Rule" to create the first sector decision rule.'
                  : 'No rules match the current filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6" />
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Sub-Sector</TableHead>
                      <TableHead>Role Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Criteria Summary</TableHead>
                      <TableHead className="text-center">Ver.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((rule) => {
                      const isExpanded = expandedIds.has(rule.id);
                      const priority = typeof rule.criteria === 'object' ? rule.criteria?.priority : undefined;
                      return (
                        <React.Fragment key={rule.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => toggleExpand(rule.id)}
                          >
                            <TableCell className="pr-0">
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-sm">
                                {rule.name ?? <span className="text-muted-foreground italic">—</span>}
                              </span>
                            </TableCell>
                            <TableCell>
                              {rule.sectors?.name
                                ? <Badge variant="outline" className="text-xs font-normal">{rule.sectors.name}</Badge>
                                : <span className="text-muted-foreground italic text-sm">—</span>}
                            </TableCell>
                            <TableCell>
                              {rule.sub_sectors?.name
                                ? <span className="text-xs text-muted-foreground">{rule.sub_sectors.name}</span>
                                : <span className="text-muted-foreground italic text-sm">All</span>}
                            </TableCell>
                            <TableCell>
                              {rule.role_type
                                ? <Badge variant="outline" className="text-xs font-normal capitalize">{rule.role_type.replace(/_/g, ' ')}</Badge>
                                : <span className="text-muted-foreground italic text-sm">Any</span>}
                            </TableCell>
                            <TableCell>{priorityBadge(priority)}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <span className="text-xs text-muted-foreground truncate block">
                                {formatCriteriaPreview(rule.criteria)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="tabular-nums text-sm">{rule.version ?? '—'}</span>
                            </TableCell>
                            <TableCell>{activeBadge(rule.is_active)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {rule.created_at
                                ? new Date(rule.created_at).toLocaleDateString('en-GB', {
                                    day: '2-digit', month: 'short', year: 'numeric',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Button
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

                          {isExpanded && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={11} className="py-0">
                                <div className="py-3 px-4">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                    Full Criteria
                                  </p>
                                  <pre className="text-xs font-mono bg-background border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed text-foreground">
                                    {formatCriteriaFull(rule.criteria) || 'No criteria defined.'}
                                  </pre>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
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
            <p className="text-sm text-blue-800 leading-relaxed">
              Sector rules are evaluated during the determination phase. Rules matching the assessment's sector and role
              type apply their criteria as the basis for the determination outcome.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-blue-700">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                Only <strong>Active</strong> rules are evaluated. Inactive rules are retained for audit history.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                <strong>Priority</strong> (High / Medium / Low) determines which rule takes precedence when multiple rules match the same sector and role.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                Leaving <strong>Sub-Sector</strong> as "None" or <strong>Role Type</strong> as "Any" makes the rule apply broadly across the sector.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                Increment the <strong>Version</strong> when making material changes to preserve the audit trail.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <RuleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        onSave={(form) => addRule.mutate(form)}
        isPending={addRule.isPending}
        mode="add"
        sectors={sectors}
        subSectors={subSectors}
        sectorsLoading={sectorsLoading}
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
          subSectors={subSectors}
          sectorsLoading={sectorsLoading}
        />
      )}
    </DashboardLayout>
  );
}
