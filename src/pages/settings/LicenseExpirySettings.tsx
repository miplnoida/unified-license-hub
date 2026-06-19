import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DEFAULT_LICENSE_EXPIRY_CONFIG,
  LicenseExpiryConfig,
  useLicenseExpiryConfig,
} from '@/hooks/useLicenseExpiryConfig';
import { useQueryClient } from '@tanstack/react-query';

export default function LicenseExpirySettings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useLicenseExpiryConfig();
  const [form, setForm] = useState<LicenseExpiryConfig>(DEFAULT_LICENSE_EXPIRY_CONFIG);
  const [remindersText, setRemindersText] = useState('10,5,1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setRemindersText((data.reminder_days || []).join(','));
    }
  }, [data]);

  const set = <K extends keyof LicenseExpiryConfig>(key: K, val: LicenseExpiryConfig[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    const reminderDays = remindersText
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => b - a);

    const payload: LicenseExpiryConfig = {
      ...form,
      reminder_days: reminderDays.length ? reminderDays : DEFAULT_LICENSE_EXPIRY_CONFIG.reminder_days,
      period_days: form.cycle_type === 'annual' ? 365 : Math.max(1, Number(form.period_days) || 365),
      renewal_fee_amount: form.renewal_fee_mode === 'paid' ? Math.max(0, Number(form.renewal_fee_amount) || 0) : 0,
      grace_period_days: Math.max(0, Number(form.grace_period_days) || 0),
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
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="License Expiry & Renewal"
          description="Configure validity cycle, expiry reminders, and renewal fee policy."
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
          <CardHeader>
            <CardTitle className="text-lg">Validity Cycle</CardTitle>
            <CardDescription>How long a license remains valid after issue or renewal.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Cycle Type</Label>
              <Select value={form.cycle_type} onValueChange={(v) => set('cycle_type', v as any)}>
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
                value={form.cycle_type === 'annual' ? 365 : form.period_days}
                disabled={form.cycle_type === 'annual'}
                onChange={(e) => set('period_days', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Grace Period after Expiry (days)</Label>
              <Input
                type="number"
                min={0}
                value={form.grace_period_days}
                onChange={(e) => set('grace_period_days', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Renewal remains allowed for this many days after expiry.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expiry Notifications</CardTitle>
            <CardDescription>When licensees and officers receive expiry reminders.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Reminder Days Before Expiry</Label>
              <Input
                value={remindersText}
                onChange={(e) => setRemindersText(e.target.value)}
                placeholder="e.g. 10, 5, 1"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of days. A notification will be sent on each of these days before expiry.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Notify Officers</Label>
                <p className="text-xs text-muted-foreground">Also send internal alerts to supervisors / regulators.</p>
              </div>
              <Switch
                checked={form.auto_notify_officer}
                onCheckedChange={(v) => set('auto_notify_officer', v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Renewal Fee</CardTitle>
            <CardDescription>Whether license renewal requires payment.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Renewal Mode</Label>
              <Select value={form.renewal_fee_mode} onValueChange={(v) => set('renewal_fee_mode', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free Renewal</SelectItem>
                  <SelectItem value="paid">Paid Renewal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Renewal Fee Amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.renewal_fee_amount}
                disabled={form.renewal_fee_mode === 'free'}
                onChange={(e) => set('renewal_fee_amount', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.renewal_fee_currency}
                disabled={form.renewal_fee_mode === 'free'}
                onChange={(e) => set('renewal_fee_currency', e.target.value.toUpperCase())}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
