import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Save, ArrowLeft, Loader2, Plus, Trash2, Eye, Pencil, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRegulator } from '@/contexts/RegulatorContext';
import {
  DEFAULT_LICENSE_EXPIRY_POLICY,
  LicenseExpiryPolicy,
  LicenseExpiryRule,
  useLicenseExpiryConfig,
} from '@/hooks/useLicenseExpiryConfig';
import { useQueryClient } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';

interface TaxonomyRow { id: string; name: string; parent_id?: string | null }

type DraftRule = LicenseExpiryRule & { _remindersText: string };

const newRuleId = () => `rule_${Math.random().toString(36).slice(2, 9)}`;

const sanitizePolicy = (p: LicenseExpiryPolicy, remindersText: string): LicenseExpiryPolicy => {
  const reminders = remindersText
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => b - a);
  return {
    cycle_type: p.cycle_type,
    period_days: p.cycle_type === 'annual' ? 365 : Math.max(1, Number(p.period_days) || 365),
    reminder_days: reminders.length ? reminders : DEFAULT_LICENSE_EXPIRY_POLICY.reminder_days,
    grace_period_days: Math.max(0, Number(p.grace_period_days) || 0),
    auto_notify_officer: !!p.auto_notify_officer,
  };
};

function PolicyFields({
  policy,
  remindersText,
  onPolicyChange,
  onRemindersChange,
}: {
  policy: LicenseExpiryPolicy;
  remindersText: string;
  onPolicyChange: (next: LicenseExpiryPolicy) => void;
  onRemindersChange: (text: string) => void;
}) {
  const set = <K extends keyof LicenseExpiryPolicy>(key: K, val: LicenseExpiryPolicy[K]) =>
    onPolicyChange({ ...policy, [key]: val });

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="space-y-2">
        <Label>Renewal cycle</Label>
        <Select value={policy.cycle_type} onValueChange={(v) => set('cycle_type', v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">Annual (365 days)</SelectItem>
            <SelectItem value="periodic">Custom period</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Validity period (days)</Label>
        <Input
          type="number"
          min={1}
          value={policy.cycle_type === 'annual' ? 365 : policy.period_days}
          disabled={policy.cycle_type === 'annual'}
          onChange={(e) => set('period_days', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-2">
        <Label>Grace period after expiry (days)</Label>
        <Input
          type="number"
          min={0}
          value={policy.grace_period_days}
          onChange={(e) => set('grace_period_days', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-2">
        <Label>Reminder days before expiry</Label>
        <Input
          value={remindersText}
          onChange={(e) => onRemindersChange(e.target.value)}
          placeholder="e.g. 30, 15, 7"
        />
        <p className="text-xs text-muted-foreground">Separate days with commas.</p>
      </div>
      <div className="md:col-span-2 flex items-center justify-between">
        <div>
          <Label>Notify officers</Label>
          <p className="text-xs text-muted-foreground">Send alerts to supervisors and regulators.</p>
        </div>
        <Switch checked={policy.auto_notify_officer} onCheckedChange={(v) => set('auto_notify_officer', v)} />
      </div>
    </div>
  );
}

export default function LicenseExpirySettings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useLicenseExpiryConfig();
  const { activeRegulatorId } = useRegulator();

  const [rules, setRules] = useState<DraftRule[]>([]);
  const [saving, setSaving] = useState(false);

  const [sectors, setSectors] = useState<TaxonomyRow[]>([]);
  const [subSectors, setSubSectors] = useState<TaxonomyRow[]>([]);
  const [categories, setCategories] = useState<TaxonomyRow[]>([]);

  /** Dialog state: 'view' is read-only, 'edit' saves back into the list. */
  const [dialogMode, setDialogMode] = useState<'view' | 'edit' | null>(null);
  const [draft, setDraft] = useState<DraftRule | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    (async () => {
      let sQuery: any = supabase.from('sectors' as any).select('id, name, regulator_id').order('name');
      if (activeRegulatorId) sQuery = sQuery.eq('regulator_id', activeRegulatorId);
      let ssQuery: any = supabase.from('sub_sectors' as any).select('id, name, sector_id, sectors!inner(regulator_id)').order('name');
      if (activeRegulatorId) ssQuery = ssQuery.eq('sectors.regulator_id', activeRegulatorId);
      let cQuery: any = supabase.from('categories' as any).select('id, name, sub_sector_id, sectors!inner(regulator_id)').order('name');
      if (activeRegulatorId) cQuery = cQuery.eq('sectors.regulator_id', activeRegulatorId);
      const [s, ss, c] = await Promise.all([sQuery, ssQuery, cQuery]);
      setSectors((s.data as any) || []);
      setSubSectors(((ss.data as any) || []).map((r: any) => ({ ...r, parent_id: r.sector_id })));
      setCategories(((c.data as any) || []).map((r: any) => ({ ...r, parent_id: r.sub_sector_id })));
    })();
  }, [activeRegulatorId]);

  const emptyRule = (): DraftRule => ({
    ...DEFAULT_LICENSE_EXPIRY_POLICY,
    id: newRuleId(),
    sector_id: null,
    sub_sector_id: null,
    category_id: null,
    _remindersText: (DEFAULT_LICENSE_EXPIRY_POLICY.reminder_days || []).join(','),
  });

  useEffect(() => {
    if (!data) return;
    setRules(data.rules.map((r) => ({ ...r, _remindersText: (r.reminder_days || []).join(',') })));
  }, [data]);

  const nameOf = (list: TaxonomyRow[], id?: string | null) =>
    (id && list.find((r) => r.id === id)?.name) || null;

  const scopeLabel = (r: DraftRule) => {
    const parts = [
      nameOf(sectors, r.sector_id) || 'Unassigned sector',
      nameOf(subSectors, r.sub_sector_id) || 'Any sub-sector',
      nameOf(categories, r.category_id) || 'Any category',
    ];
    return parts;
  };

  const persist = async (nextRules: DraftRule[]) => {
    const invalid = nextRules.some((r) => !r.sector_id);
    if (invalid) {
      toast.error('Every rule must have a sector selected.');
      return false;
    }
    const payload = {
      // No default policy — expiry/renewal applies only to licenses whose
      // sector matches a configured rule.
      default: null,
      rules: nextRules.map((r) => ({
        id: r.id,
        sector_id: r.sector_id || null,
        sub_sector_id: r.sub_sector_id || null,
        category_id: r.category_id || null,
        ...sanitizePolicy(r, r._remindersText),
      })),
    };
    setSaving(true);
    try {
      const { error } = await (supabase
        .from('site_settings' as any)
        .upsert({ key: 'license_expiry', value: payload }, { onConflict: 'key' }) as any);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['license_expiry_config'] });
      qc.invalidateQueries({ queryKey: ['license_expiry_status'] });
      toast.success('License expiry settings saved');
      return true;
    } catch (err: any) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => { setDraft(emptyRule()); setIsNew(true); setDialogMode('edit'); };
  const openEdit = (r: DraftRule) => { setDraft({ ...r }); setIsNew(false); setDialogMode('edit'); };
  const openView = (r: DraftRule) => { setDraft({ ...r }); setIsNew(false); setDialogMode('view'); };
  const closeDialog = () => { setDialogMode(null); setDraft(null); setIsNew(false); };

  const saveDraft = async () => {
    if (!draft) return;
    const next = isNew
      ? [...rules, draft]
      : rules.map((r) => (r.id === draft.id ? draft : r));
    const ok = await persist(next);
    if (ok) { setRules(next); closeDialog(); }
  };

  const deleteRule = async (r: DraftRule) => {
    const next = rules.filter((x) => x.id !== r.id);
    const ok = await persist(next);
    if (ok) setRules(next);
  };

  const availableSubSectors = useMemo(
    () => subSectors.filter((ss) => !draft?.sector_id || ss.parent_id === draft.sector_id),
    [subSectors, draft?.sector_id],
  );
  const availableCategories = useMemo(
    () => categories.filter((c) => !draft?.sub_sector_id || c.parent_id === draft.sub_sector_id),
    [categories, draft?.sub_sector_id],
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="License Expiry & Renewal"
          description="Set validity period, reminders, and grace period for each sector."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button data-rbac="settings.edit" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" />Add Rule
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-primary" />Configured expiry rules
            </CardTitle>
            <CardDescription>
              Each rule decides how long licenses stay valid for a sector (optionally narrowed to a
              sub-sector or category), when reminders go out, and the grace period after expiry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="mb-4">No expiry rules configured yet.</p>
                <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add your first rule</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Renewal cycle</TableHead>
                      <TableHead>Validity</TableHead>
                      <TableHead>Reminders</TableHead>
                      <TableHead>Grace</TableHead>
                      <TableHead>Notify officers</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => {
                      const [sec, sub, cat] = scopeLabel(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{sec}</p>
                            <p className="text-xs text-muted-foreground">{sub} · {cat}</p>
                          </TableCell>
                          <TableCell>{r.cycle_type === 'annual' ? 'Annual' : 'Custom period'}</TableCell>
                          <TableCell>{r.cycle_type === 'annual' ? 365 : r.period_days} days</TableCell>
                          <TableCell className="font-mono text-xs">
                            {(r.reminder_days || []).join(', ') || '—'}
                          </TableCell>
                          <TableCell>{r.grace_period_days} days</TableCell>
                          <TableCell>
                            <Badge variant={r.auto_notify_officer ? 'approved' : 'outline'}>
                              {r.auto_notify_officer ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => openView(r)}>
                              <Eye className="h-4 w-4 mr-1" />View
                            </Button>
                            <Button data-rbac="settings.edit" variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4 mr-1" />Edit
                            </Button>
                            <Button
                              data-rbac="settings.edit"
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              onClick={() => deleteRule(r)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!dialogMode} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'view' ? 'Expiry rule details' : isNew ? 'Add expiry rule' : 'Edit expiry rule'}
            </DialogTitle>
            <DialogDescription>
              Validity, reminder schedule and grace period applied to licenses matching this scope.
            </DialogDescription>
          </DialogHeader>

          {draft && dialogMode === 'view' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ['Sector', scopeLabel(draft)[0]],
                  ['Sub-sector', scopeLabel(draft)[1]],
                  ['Category', scopeLabel(draft)[2]],
                  ['Renewal cycle', draft.cycle_type === 'annual' ? 'Annual (365 days)' : 'Custom period'],
                  ['Validity period', `${draft.cycle_type === 'annual' ? 365 : draft.period_days} days`],
                  ['Grace period', `${draft.grace_period_days} days`],
                  ['Reminder days', (draft.reminder_days || []).join(', ') || '—'],
                  ['Notify officers', draft.auto_notify_officer ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-md border bg-muted/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft && dialogMode === 'edit' && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Sector</Label>
                  <Select
                    value={draft.sector_id || ''}
                    onValueChange={(v) => setDraft({ ...draft, sector_id: v, sub_sector_id: null, category_id: null })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sub-sector (optional)</Label>
                  <Select
                    value={draft.sub_sector_id || 'any'}
                    onValueChange={(v) => setDraft({ ...draft, sub_sector_id: v === 'any' ? null : v, category_id: null })}
                    disabled={!draft.sector_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Any sub-sector" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any sub-sector</SelectItem>
                      {availableSubSectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category (optional)</Label>
                  <Select
                    value={draft.category_id || 'any'}
                    onValueChange={(v) => setDraft({ ...draft, category_id: v === 'any' ? null : v })}
                    disabled={!draft.sub_sector_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Any category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any category</SelectItem>
                      {availableCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <PolicyFields
                policy={draft}
                remindersText={draft._remindersText}
                onPolicyChange={(next) => setDraft({ ...draft, ...next })}
                onRemindersChange={(text) => setDraft({ ...draft, _remindersText: text })}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {dialogMode === 'view' ? 'Close' : 'Cancel'}
            </Button>
            {dialogMode === 'edit' && (
              <Button data-rbac="settings.edit" onClick={saveDraft} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Rule
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
