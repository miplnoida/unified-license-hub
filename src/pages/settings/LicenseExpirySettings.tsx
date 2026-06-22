import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ArrowLeft, Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DEFAULT_LICENSE_EXPIRY_POLICY,
  LicenseExpiryPolicy,
  LicenseExpiryRule,
  useLicenseExpiryConfig,
} from '@/hooks/useLicenseExpiryConfig';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

interface TaxonomyRow { id: string; name: string; parent_id?: string | null }

type DraftRule = LicenseExpiryRule & { _remindersText: string };

const newRuleId = () => `rule_${Math.random().toString(36).slice(2, 9)}`;

const policyToDraft = (p: LicenseExpiryPolicy): { policy: LicenseExpiryPolicy; remindersText: string } => ({
  policy: { ...p },
  remindersText: (p.reminder_days || []).join(','),
});

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
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label>Cycle Type</Label>
        <Select value={policy.cycle_type} onValueChange={(v) => set('cycle_type', v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">Annual (365 days)</SelectItem>
            <SelectItem value="periodic">Periodic (custom)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Validity Period (days)</Label>
        <Input
          type="number"
          min={1}
          value={policy.cycle_type === 'annual' ? 365 : policy.period_days}
          disabled={policy.cycle_type === 'annual'}
          onChange={(e) => set('period_days', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-2">
        <Label>Grace Period after Expiry (days)</Label>
        <Input
          type="number"
          min={0}
          value={policy.grace_period_days}
          onChange={(e) => set('grace_period_days', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-2">
        <Label>Reminder Days Before Expiry</Label>
        <Input
          value={remindersText}
          onChange={(e) => onRemindersChange(e.target.value)}
          placeholder="e.g. 10, 5, 1"
        />
        <p className="text-xs text-muted-foreground">Comma-separated days before expiry.</p>
      </div>
      <div className="md:col-span-2 flex items-center justify-between">
        <div>
          <Label>Notify Officers</Label>
          <p className="text-xs text-muted-foreground">Also send internal alerts to supervisors / regulators.</p>
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

  const [defaultPolicy, setDefaultPolicy] = useState<LicenseExpiryPolicy>(DEFAULT_LICENSE_EXPIRY_POLICY);
  const [defaultRemindersText, setDefaultRemindersText] = useState('10,5,1');
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [saving, setSaving] = useState(false);

  const [sectors, setSectors] = useState<TaxonomyRow[]>([]);
  const [subSectors, setSubSectors] = useState<TaxonomyRow[]>([]);
  const [categories, setCategories] = useState<TaxonomyRow[]>([]);

  useEffect(() => {
    (async () => {
      const [s, ss, c] = await Promise.all([
        (supabase.from('sectors' as any).select('id, name').order('name') as any),
        (supabase.from('sub_sectors' as any).select('id, name, sector_id').order('name') as any),
        (supabase.from('categories' as any).select('id, name, sub_sector_id').order('name') as any),
      ]);
      setSectors((s.data as any) || []);
      setSubSectors(((ss.data as any) || []).map((r: any) => ({ ...r, parent_id: r.sector_id })));
      setCategories(((c.data as any) || []).map((r: any) => ({ ...r, parent_id: r.sub_sector_id })));
    })();
  }, []);

  useEffect(() => {
    if (!data) return;
    setDefaultPolicy(data.default);
    setDefaultRemindersText((data.default.reminder_days || []).join(','));
    setRules(
      data.rules.map((r) => ({
        ...r,
        _remindersText: (r.reminder_days || []).join(','),
      })),
    );
  }, [data]);

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      {
        ...DEFAULT_LICENSE_EXPIRY_POLICY,
        id: newRuleId(),
        sector_id: null,
        sub_sector_id: null,
        category_id: null,
        _remindersText: (DEFAULT_LICENSE_EXPIRY_POLICY.reminder_days || []).join(','),
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<DraftRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRule = (id: string) =>
    setRules((prev) => prev.filter((r) => r.id !== id));

  const handleSave = async () => {
    const missingSector = rules.some((r) => !r.sector_id);
    if (missingSector) {
      toast.error('Every rule must have a sector selected.');
      return;
    }

    const payload = {
      // No default policy — expiry/renewal applies only to licenses whose
      // sector matches a configured rule.
      default: null,
      rules: rules.map((r) => ({
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
    } catch (err: any) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

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
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="License Expiry & Renewal"
          description="Configure validity cycle, expiry reminders, and grace period per sector / sub-sector / category."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Sector-Based Rules</CardTitle>
              <CardDescription>
                Configure expiry, reminders, and grace period per sector. Optionally narrow by sub-sector or category. Most-specific match wins.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="h-4 w-4 mr-1" />Add Rule
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No rules configured. Add a sector-based rule to enable expiry reminders.
              </p>
            )}
            {rules.map((rule, idx) => {
              const availableSubSectors = subSectors.filter((ss) => !rule.sector_id || ss.parent_id === rule.sector_id);
              const availableCategories = categories.filter((c) => !rule.sub_sector_id || c.parent_id === rule.sub_sector_id);
              return (
                <div key={rule.id} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Rule {idx + 1}</p>
                    <Button variant="ghost" size="sm" onClick={() => removeRule(rule.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select
                        value={rule.sector_id || 'any'}
                        onValueChange={(v) =>
                          updateRule(rule.id, {
                            sector_id: v === 'any' ? null : v,
                            sub_sector_id: null,
                            category_id: null,
                          })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any sector</SelectItem>
                          {sectors.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sub-Sector</Label>
                      <Select
                        value={rule.sub_sector_id || 'any'}
                        onValueChange={(v) =>
                          updateRule(rule.id, {
                            sub_sector_id: v === 'any' ? null : v,
                            category_id: null,
                          })
                        }
                        disabled={!rule.sector_id}
                      >
                        <SelectTrigger><SelectValue placeholder={rule.sector_id ? 'Any sub-sector' : 'Pick sector first'} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any sub-sector</SelectItem>
                          {availableSubSectors.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={rule.category_id || 'any'}
                        onValueChange={(v) =>
                          updateRule(rule.id, { category_id: v === 'any' ? null : v })
                        }
                        disabled={!rule.sub_sector_id}
                      >
                        <SelectTrigger><SelectValue placeholder={rule.sub_sector_id ? 'Any category' : 'Pick sub-sector first'} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any category</SelectItem>
                          {availableCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator />
                  <PolicyFields
                    policy={rule}
                    remindersText={rule._remindersText}
                    onPolicyChange={(next) => updateRule(rule.id, next)}
                    onRemindersChange={(text) => updateRule(rule.id, { _remindersText: text })}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
