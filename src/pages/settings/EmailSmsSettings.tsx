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
  useResendKeyPresent,
  useProviderSecretPresent,
  useProviderSecretStatus,
  SecretNotSavedError,
  useSaveResendApiKey,
  DEFAULTS,
  EmailSmsSettings as EmailSmsSettingsT,
} from '@/hooks/useEmailSmsSettings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSmsSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: saved, isLoading } = useEmailSmsSettings();
  const saveMutation = useSaveEmailSmsSettings();
  const { data: resendKeyPresent } = useResendKeyPresent();
  const { data: smtpSecretPresent } = useProviderSecretPresent('smtp_password');
  const { data: smsSecretPresent } = useProviderSecretPresent('sms_api_key');
  const { data: smtpSecretStatus } = useProviderSecretStatus('smtp_password');
  const saveResendKey = useSaveResendApiKey();

  const [form, setForm] = useState<EmailSmsSettingsT>(DEFAULTS);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [resendApiKey, setResendApiKey] = useState('');
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingResendTest, setSendingResendTest] = useState(false);

  useEffect(() => {
    if (saved) {
      // Secrets are never read back; inputs are write-only.
      setForm({
        email: saved.email,
        resend: saved.resend,
        smtp: { ...saved.smtp, password: '' },
        sms: { ...saved.sms, apiKey: '' },
      });
    }
  }, [saved]);

  useEffect(() => { setHasSavedPassword(!!smtpSecretPresent); }, [smtpSecretPresent]);
  useEffect(() => { setHasSavedApiKey(!!smsSecretPresent); }, [smsSecretPresent]);

  useEffect(() => {
    if (!testTo && user?.email) setTestTo(user.email);
  }, [user, testTo]);

  const updateEmail = <K extends keyof EmailSmsSettingsT['email']>(k: K, v: EmailSmsSettingsT['email'][K]) =>
    setForm((p) => ({ ...p, email: { ...p.email, [k]: v } }));
  const updateResend = <K extends keyof EmailSmsSettingsT['resend']>(k: K, v: EmailSmsSettingsT['resend'][K]) =>
    setForm((p) => ({ ...p, resend: { ...p.resend, [k]: v } }));
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

  const resendKeyAvailable = !!resendKeyPresent || resendApiKey.length > 0;
  const resendStatusLabel = (() => {
    if (!form.resend.enabled) return 'Disabled';
    if (!resendKeyAvailable) return 'Missing API Key';
    if (form.resend.status === 'tested_ok') return 'Tested OK';
    if (form.resend.status === 'domain_not_verified') return 'Resend Domain Not Verified';
    if (form.resend.status === 'provider_error') return 'Provider Error';
    return 'Configured (not tested)';
  })();
  const resendHealthy = form.resend.enabled && resendKeyAvailable && form.resend.status === 'tested_ok';
  const emailDeliveryAvailable = form.email.enabled && (resendHealthy || smtpReady);

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
    if (form.email.fromEmail && !EMAIL_RE.test(form.email.fromEmail)) {
      toast.error('Valid global From Email is required');
      return;
    }
    try {
      if (resendApiKey.trim().length > 0) {
        await saveResendKey.mutateAsync(resendApiKey.trim());
        setResendApiKey('');
      }
      const result = await saveMutation.mutateAsync(form);
      if (form.smtp.password) setHasSavedPassword(true);
      if (form.sms.apiKey) setHasSavedApiKey(true);
      setForm({
        email: result.email,
        resend: result.resend,
        smtp: { ...result.smtp, password: '' },
        sms: { ...result.sms, apiKey: '' },
      });
      toast.success('Email & SMS settings saved');
    } catch (e: any) {
      if (e instanceof SecretNotSavedError) {
        // Keep the typed value so the administrator can retry; never show success.
        toast.error(e.message);
        return;
      }
      toast.error('Failed to save: ' + (e.message || 'Unknown error'));
    }
  };

  const unsavedSmtpPassword = !!form.smtp.password;

  const handleSendTest = async () => {
    if (unsavedSmtpPassword) {
      toast.error('Save the new SMTP password successfully before testing.');
      return;
    }
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
      // SEC-CRED-01A: the test uses ONLY the saved server-side configuration and secret.
      const { data, error } = await supabase.functions.invoke('test-smtp-email', {
        body: { to: testTo },
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

  const handleSendResendTest = async () => {
    if (!testTo || !EMAIL_RE.test(testTo)) {
      toast.error('Enter a valid recipient email');
      return;
    }
    setSendingResendTest(true);
    try {
      // Persist a newly typed key server-side first: it is never sent to the provider from the browser.
      if (resendApiKey.trim().length > 0) {
        await saveResendKey.mutateAsync(resendApiKey.trim());
        setResendApiKey('');
      }
      const { data, error } = await supabase.functions.invoke('test-resend-email', {
        body: { to: testTo },
      });
      if (error) throw error;
      const status = (data?.status || 'provider_error') as EmailSmsSettingsT['resend']['status'];
      updateResend('status', status);
      updateResend('lastTestedAt', new Date().toISOString());
      updateResend('lastError', data?.success ? null : (data?.error ?? 'Unknown error'));
      // Persist the observed provider health immediately (SMTP config untouched).
      await saveMutation.mutateAsync({
        ...form,
        resend: {
          ...form.resend,
          status,
          lastTestedAt: new Date().toISOString(),
          lastError: data?.success ? null : (data?.error ?? 'Unknown error'),
        },
      });
      if (!data?.success) throw new Error(data?.error || 'Unknown error');
      toast.success(`Resend test email accepted for ${data.to || testTo}`);
    } catch (e: any) {
      toast.error('Resend test failed: ' + (e.message || 'Unknown error'));
    } finally {
      setSendingResendTest(false);
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
              <Button data-rbac="settings.edit" onClick={handleSave} disabled={saveMutation.isPending}>
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
                <CardTitle className="text-lg">Email Delivery — General</CardTitle>
                <CardDescription>
                  Global sender identity and fallback behaviour. Resend is tried first, SMTP second.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={emailDeliveryAvailable ? 'text-green-600 border-green-600' : 'text-muted-foreground'}
              >
                {emailDeliveryAvailable ? 'Email Delivery Available' : 'No Provider Operational'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Switch
                id="email-enabled"
                checked={form.email.enabled}
                onCheckedChange={(v) => updateEmail('enabled', v)}
              />
              <Label htmlFor="email-enabled">Enable Email Delivery</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="email-fallback"
                checked={form.email.autoFallback}
                onCheckedChange={(v) => updateEmail('autoFallback', v)}
              />
              <Label htmlFor="email-fallback">Automatic Fallback to SMTP</Label>
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                value={form.email.fromName}
                onChange={(e) => updateEmail('fromName', e.target.value)}
                placeholder="OLRAS"
              />
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                type="email"
                value={form.email.fromEmail}
                onChange={(e) => updateEmail('fromEmail', e.target.value)}
                placeholder="OLRAS@mishainfotech.us"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Reply-To (optional)</Label>
              <Input
                type="email"
                value={form.email.replyTo}
                onChange={(e) => updateEmail('replyTo', e.target.value)}
                placeholder="support@example.com"
                className="md:max-w-md"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-150">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Resend</CardTitle>
                <CardDescription>
                  <Badge variant="outline" className="mr-2 text-primary border-primary">PRIMARY EMAIL PROVIDER</Badge>
                  Delivery is attempted here first.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={resendHealthy ? 'text-green-600 border-green-600' : 'text-muted-foreground'}
              >
                {resendStatusLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Switch
                id="resend-enabled"
                checked={form.resend.enabled}
                onCheckedChange={(v) => updateResend('enabled', v)}
              />
              <Label htmlFor="resend-enabled">Enable Resend</Label>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder={resendKeyPresent ? 'Leave blank to keep existing API key' : 'Enter Resend API key'}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Stored server-side only; it is never returned to this screen.
              </p>
            </div>
            {form.resend.lastError && (
              <p className="md:col-span-2 text-xs text-destructive">{form.resend.lastError}</p>
            )}
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
                  data-rbac="settings.edit"
                  variant="outline"
                  onClick={handleSendResendTest}
                  disabled={sendingResendTest}
                >
                  {sendingResendTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test via Resend
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">SMTP Configuration</CardTitle>
                <CardDescription>
                  <Badge variant="outline" className="mr-2">FALLBACK EMAIL PROVIDER</Badge>
                  Used when Resend is unavailable. Existing configuration is preserved.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={smtpReady ? 'text-green-600 border-green-600' : 'text-muted-foreground'}
              >
                {smtpReady ? 'Configured' : 'Not Configured'}
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
              <p className="text-xs text-muted-foreground" data-testid="smtp-secret-status">
                Password: {smtpSecretStatus?.configured ? 'Configured' : 'Not configured'}
                {smtpSecretStatus?.updated_at && (
                  <> · Last changed: {new Date(smtpSecretStatus.updated_at).toUTCString().replace('GMT', 'UTC')}</>
                )}
              </p>
              {unsavedSmtpPassword && (
                <p className="text-xs text-destructive">Save the new SMTP password successfully before testing.</p>
              )}
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
                <Button data-rbac="settings.edit"
                  variant="outline"
                  size="default"
                  onClick={handleSendTest}
                  disabled={sendingTest || unsavedSmtpPassword}
                  data-testid="smtp-send-test"
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
