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
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
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

// Matches fp_findings.check_type / fp_screening_configs.check_type — the values
// resolveFpSectorRule/evaluateFpCriteria (src/lib/fpSectorRules.ts) actually
// compare against when a determination is evaluated.
const KNOWN_CHECK_TYPES = [
  'sanctions', 'pep', 'adverse_media', 'criminal_history', 'regulator_watchlist', 'credit_history',
] as const;

const CHECK_TYPE_OPTIONS: MultiSelectOption[] = KNOWN_CHECK_TYPES.map((t) => ({
  value: t,
  label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

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
  min_score: string;
  mandatory_checks: string[];
  disqualifiers: string[];
  warnings: string[];
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
  min_score: '',
  mandatory_checks: [],
  disqualifiers: [],
  warnings: [],
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
// This shape — { min_score, mandatory_checks[], disqualifiers[], warnings[] } —
// is not a UI convention; it's exactly what resolveFpSectorRule/evaluateFpCriteria
// in src/lib/fpSectorRules.ts read when a determination is evaluated. Keeping
// this page's payload aligned with that evaluator is what makes a rule
// configured here actually affect a decision.

function parseCriteriaToForm(criteria: any): CriteriaForm {
  if (!criteria || typeof criteria !== 'object') {
    return { ...EMPTY_CRITERIA, description: typeof criteria === 'string' ? criteria : '' };
  }
  const toArr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    description: criteria.description ?? '',
    min_score: criteria.min_score != null ? String(criteria.min_score) : '',
    mandatory_checks: toArr(criteria.mandatory_checks),
    disqualifiers: toArr(criteria.disqualifiers),
    warnings: toArr(criteria.warnings),
  };
}

function buildCriteriaPayload(form: CriteriaForm): object {
  const payload: Record<string, any> = {};
  if (form.description.trim()) payload.description = form.description.trim();
  const score = parseFloat(form.min_score);
  if (!isNaN(score)) payload.min_score = score;
  if (form.mandatory_checks.length) payload.mandatory_checks = form.mandatory_checks;
  if (form.disqualifiers.length) payload.disqualifiers = form.disqualifiers;
  if (form.warnings.length) payload.warnings = form.warnings;
  return payload;
}

function formatCriteriaPreview(criteria: any): string {
  if (!criteria || typeof criteria !== 'object') return '—';
  const parts: string[] = [];
  if (criteria.description) parts.push(String(criteria.description).slice(0, 60));
  if (criteria.min_score != null) parts.push(`Min score: ${criteria.min_score}`);
  if (Array.isArray(criteria.mandatory_checks) && criteria.mandatory_checks.length) {
    parts.push(`Requires: ${criteria.mandatory_checks.join(', ')}`);
  }
  if (Array.isArray(criteria.disqualifiers) && criteria.disqualifiers.length) {
    parts.push(`Disqualifies: ${criteria.disqualifiers.join(', ')}`);
  }
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
            <p className="text-sm font-semibold mb-1">Rule Criteria</p>
            <p className="text-xs text-muted-foreground mb-3">
              Evaluated automatically against an individual's completed screening checks when a
              determination is recorded on the Determinations page.
            </p>

            <div className="mb-3">
              <Label>
                Min. Confidence Score{' '}
                <span className="text-xs font-normal text-muted-foreground">(0–100, optional)</span>
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 70"
                value={form.criteria.min_score}
                onChange={(e) => setCriteria('min_score', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Average AI confidence score across active findings must meet this minimum.
              </p>
            </div>

            <div className="mb-3">
              <Label>Mandatory Checks</Label>
              <MultiSelect
                options={CHECK_TYPE_OPTIONS}
                selected={form.criteria.mandatory_checks}
                onChange={(v) => setCriteria('mandatory_checks', v)}
                placeholder="Select required check types…"
                withinDialog
              />
              <p className="text-xs text-muted-foreground mt-1">
                A finding of each selected check type must exist and be active.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Disqualifiers</Label>
                <MultiSelect
                  options={CHECK_TYPE_OPTIONS}
                  selected={form.criteria.disqualifiers}
                  onChange={(v) => setCriteria('disqualifiers', v)}
                  placeholder="Select disqualifying checks…"
                  withinDialog
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Presence of any of these check types fails the rule outright.
                </p>
              </div>
              <div>
                <Label>Warnings</Label>
                <MultiSelect
                  options={CHECK_TYPE_OPTIONS}
                  selected={form.criteria.warnings}
                  onChange={(v) => setCriteria('warnings', v)}
                  placeholder="Select warning checks…"
                  withinDialog
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Missing checks here are flagged but don't fail the rule.
                </p>
              </div>
            </div>

            <div>
              <Label>Description / Rationale</Label>
              <Textarea
                rows={3}
                placeholder="Explain the reasoning or legal basis for this rule…"
                value={form.criteria.description}
                onChange={(e) => setCriteria('description', e.target.value)}
              />
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
        criteria: buildCriteriaPayload(form.criteria) as any,
        created_by: user?.id ?? null,
      } as any);
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
          criteria: buildCriteriaPayload(form.criteria) as any,
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
                              <TableCell colSpan={10} className="py-0">
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
                When several active rules match, the <strong>most specific</strong> one wins — an exact sector + sub-sector + role type match beats a sector-only match.
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
