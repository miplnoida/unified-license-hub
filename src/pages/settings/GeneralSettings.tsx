import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSiteSettings, GeneralSettings as GeneralType } from '@/contexts/SiteSettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function GeneralSettings() {
  const navigate = useNavigate();
  const { general, refreshSettings } = useSiteSettings();
  const [form, setForm] = useState<GeneralType>(general);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(general); }, [general]);

  const set = <K extends keyof GeneralType>(key: K, val: GeneralType[K]) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.from('site_settings' as any).upsert({ key: 'general', value: form }, { onConflict: 'key' }) as any);
      if (error) throw error;
      sessionStorage.removeItem('site_settings_cache');
      await refreshSettings();
      toast.success('General settings saved successfully');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="General Settings"
          description="Configure global application preferences and system parameters."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Organization Details</CardTitle>
            <CardDescription>Basic organization and branding configuration.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input value={form.org_name} onChange={e => set('org_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Short Name / Acronym</Label>
              <Input value={form.org_short_name} onChange={e => set('org_short_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Regional & Format</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={v => set('timezone', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc-5">UTC-05:00 (Eastern)</SelectItem>
                  <SelectItem value="utc-6">UTC-06:00 (Central)</SelectItem>
                  <SelectItem value="utc-8">UTC-08:00 (Pacific)</SelectItem>
                  <SelectItem value="utc+0">UTC+00:00 (GMT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Format</Label>
              <Select value={form.date_format} onValueChange={v => set('date_format', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                  <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                  <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select value={form.language} onValueChange={v => set('language', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD ($)</SelectItem>
                  <SelectItem value="eur">EUR (€)</SelectItem>
                  <SelectItem value="gbp">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">System Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {([
              { key: 'email_notifications' as const, label: 'Enable Email Notifications', desc: 'Send email alerts for application status changes.' },
              { key: 'sms_notifications' as const, label: 'Enable SMS Notifications', desc: 'Send SMS alerts for overdue returns.' },
              { key: 'maintenance_mode' as const, label: 'Maintenance Mode', desc: 'Disable public access during system updates.' },
              { key: 'audit_logging' as const, label: 'Audit Logging', desc: 'Record all user actions for compliance auditing.' },
            ]).map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={form[item.key]} onCheckedChange={v => set(item.key, v)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
