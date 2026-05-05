import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  useEmailSmsSettings,
  useSaveEmailSmsSettings,
  DEFAULTS,
  EmailSmsSettings as EmailSmsSettingsT,
} from '@/hooks/useEmailSmsSettings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSmsSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: saved, isLoading } = useEmailSmsSettings();
  const saveMutation = useSaveEmailSmsSettings();

  const [form, setForm] = useState<EmailSmsSettingsT>(DEFAULTS);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (saved) {
      setHasSavedPassword(!!saved.smtp.password);
      setHasSavedApiKey(!!saved.sms.apiKey);
      // Don't expose stored secrets in inputs
      setForm({
        smtp: { ...saved.smtp, password: '' },
        sms: { ...saved.sms, apiKey: '' },
      });
    }
  }, [saved]);

  useEffect(() => {
    if (!testTo && user?.email) setTestTo(user.email);
  }, [user, testTo]);

  const updateSmtp = <K extends keyof EmailSmsSettingsT['smtp']>(k: K, v: EmailSmsSettingsT['smtp'][K]) =>
    setForm((p) => ({ ...p, smtp: { ...p.smtp, [k]: v } }));
  const updateSms = <K extends keyof EmailSmsSettingsT['sms']>(k: K, v: EmailSmsSettingsT['sms'][K]) =>
    setForm((p) => ({ ...p, sms: { ...p.sms, [k]: v } }));

  const smtpReady =
    !!form.smtp.host &&
    form.smtp.port > 0 &&
    !!form.smtp.username &&
    !!form.smtp.fromEmail &&
    (hasSavedPassword || !!form.smtp.password) &&
    form.smtp.enabled;

  const validateSmtp = (): string | null => {
    if (!form.smtp.host) return 'SMTP host is required';
    if (!form.smtp.port || form.smtp.port < 1 || form.smtp.port > 65535) return 'SMTP port must be 1-65535';
    if (!form.smtp.username) return 'SMTP username is required';
    if (!form.smtp.fromEmail || !EMAIL_RE.test(form.smtp.fromEmail)) return 'Valid From Email is required';
    if (!hasSavedPassword && !form.smtp.password) return 'SMTP password is required';
    return null;
  };

  const handleSave = async () => {
    const err = validateSmtp();
    if (err && form.smtp.enabled) {
      toast.error(err);
      return;
    }
    try {
      const result = await saveMutation.mutateAsync(form);
      setHasSavedPassword(!!result.smtp.password);
      setHasSavedApiKey(!!result.sms.apiKey);
      setForm({
        smtp: { ...result.smtp, password: '' },
        sms: { ...result.sms, apiKey: '' },
      });
      toast.success('Email & SMS settings saved');
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown error'));
    }
  };

  const handleSendTest = async () => {
    const err = validateSmtp();
    if (err) {
      toast.error(err);
      return;
    }
    if (!testTo || !EMAIL_RE.test(testTo)) {
      toast.error('Enter a valid recipient email');
      return;
    }
    setSendingTest(true);
    try {
      const smtpPayload = { ...form.smtp };
      if (!smtpPayload.password) delete (smtpPayload as any).password;
      const { data, error } = await supabase.functions.invoke('test-smtp-email', {
        body: { to: testTo, smtp: smtpPayload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unknown error');
      toast.success(`Test email sent successfully to ${data.to || testTo}`);
    } catch (e: any) {
      toast.error('Failed to send test email: ' + (e.message || 'Unknown error'));
    } finally {
      setSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Email & SMS Settings"
          description="Configure email server and SMS gateway connections."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">SMTP Configuration</CardTitle>
                <CardDescription>Configure the outbound email server.</CardDescription>
              </div>
              <Badge
                variant="outline"
                className={smtpReady ? 'text-green-600 border-green-600' : 'text-muted-foreground'}
              >
                {smtpReady ? 'Connected' : 'Not Configured'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input
                value={form.smtp.host}
                onChange={(e) => updateSmtp('host', e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP Port</Label>
              <Input
                type="number"
                value={form.smtp.port}
                onChange={(e) => updateSmtp('port', Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={form.smtp.username}
                onChange={(e) => updateSmtp('username', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={form.smtp.password || ''}
                onChange={(e) => updateSmtp('password', e.target.value)}
                placeholder={hasSavedPassword ? 'Leave blank to keep existing password' : 'Enter SMTP password'}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Encryption</Label>
              <Select
                value={form.smtp.encryption}
                onValueChange={(v) => updateSmtp('encryption', v as 'none' | 'ssl' | 'tls')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="tls">TLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                value={form.smtp.fromName}
                onChange={(e) => updateSmtp('fromName', e.target.value)}
                placeholder="Unified License Hub"
              />
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                type="email"
                value={form.smtp.fromEmail}
                onChange={(e) => updateSmtp('fromEmail', e.target.value)}
                placeholder="noreply@example.com"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={form.smtp.enabled}
                onCheckedChange={(v) => updateSmtp('enabled', v)}
                id="smtp-enabled"
              />
              <Label htmlFor="smtp-enabled">Enable SMTP Delivery</Label>
            </div>

            <div className="md:col-span-2 border-t pt-4 space-y-2">
              <Label>Test Recipient Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="max-w-md"
                />
                <Button
                  variant="outline"
                  size="default"
                  onClick={handleSendTest}
                  disabled={sendingTest}
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test Email
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">SMS Gateway</CardTitle>
                <CardDescription>Configure SMS delivery provider.</CardDescription>
              </div>
              <Badge
                variant="outline"
                className={form.sms.enabled && (hasSavedApiKey || form.sms.apiKey) && form.sms.senderId ? 'text-green-600 border-green-600' : 'text-muted-foreground'}
              >
                {form.sms.enabled && (hasSavedApiKey || form.sms.apiKey) && form.sms.senderId ? 'Connected' : 'Not Configured'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.sms.provider}
                onValueChange={(v) => updateSms('provider', v as 'twilio' | 'vonage' | 'messagebird')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="vonage">Vonage</SelectItem>
                  <SelectItem value="messagebird">MessageBird</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={form.sms.apiKey || ''}
                onChange={(e) => updateSms('apiKey', e.target.value)}
                placeholder={hasSavedApiKey ? 'Leave blank to keep existing API key' : 'Enter API key'}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Sender ID / Phone</Label>
              <Input
                value={form.sms.senderId}
                onChange={(e) => updateSms('senderId', e.target.value)}
                placeholder="+1-555-0100"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={form.sms.enabled}
                onCheckedChange={(v) => updateSms('enabled', v)}
                id="sms-enabled"
              />
              <Label htmlFor="sms-enabled">Enable SMS Delivery</Label>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
