import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/datetime';
import {
  CAPTCHA_PROVIDER_LABELS, useCaptchaConfigurations, useCaptchaRuntime,
  type CaptchaConfiguration, type CaptchaProvider,
} from '@/hooks/useCaptchaConfig';
import { CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';

interface FormState {
  id?: string;
  name: string;
  provider: CaptchaProvider;
  site_key: string;
  environment: 'sandbox' | 'production';
  notes: string;
  secret_key: string;
  score_threshold: string;
  expected_action: string;
}

const emptyForm: FormState = {
  name: '',
  provider: 'recaptcha_v2',
  site_key: '',
  environment: 'production',
  notes: '',
  secret_key: '',
  score_threshold: '0.5',
  expected_action: 'registration',
};

export default function CaptchaSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: configurations = [], isLoading, refetch } = useCaptchaConfigurations();
  const { data: runtime } = useCaptchaRuntime();

  const [enabled, setEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (runtime) setEnabled(runtime.globallyEnabled || false);
  }, [runtime]);

  const invalidate = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ['captcha-runtime'] });
  };

  const toggleEnabled = async (next: boolean) => {
    if (next && !configurations.some((c) => c.is_active)) {
      toast({
        title: 'No active configuration',
        description: 'Activate a CAPTCHA configuration before enabling verification.',
        variant: 'destructive',
      });
      return;
    }
    setSavingToggle(true);
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: 'captcha_enabled', value: next }, { onConflict: 'key' });
    setSavingToggle(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setEnabled(next);
    invalidate();
    toast({ title: next ? 'CAPTCHA enabled' : 'CAPTCHA disabled' });
  };

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (config: CaptchaConfiguration) => {
    setForm({
      id: config.id,
      name: config.name,
      provider: config.provider,
      site_key: config.site_key,
      environment: config.environment,
      notes: config.notes ?? '',
      secret_key: '',
      score_threshold: config.score_threshold != null ? String(config.score_threshold) : '0.5',
      expected_action: config.expected_action ?? 'registration',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (form.site_key.trim().length < 10) {
      toast({ title: 'Enter a valid site key', variant: 'destructive' });
      return;
    }
    if (!form.id && form.secret_key.trim().length < 10) {
      toast({ title: 'Enter the provider secret key', variant: 'destructive' });
      return;
    }
    const threshold = Number(form.score_threshold);
    if (form.provider === 'recaptcha_v3' && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
      toast({ title: 'Score threshold must be between 0 and 1', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let configurationId = form.id;
      const payload = {
        name: form.name.trim(),
        provider: form.provider,
        site_key: form.site_key.trim(),
        environment: form.environment,
        notes: form.notes.trim() || null,
        score_threshold: form.provider === 'recaptcha_v3' ? threshold : null,
        expected_action: form.provider === 'recaptcha_v3' ? (form.expected_action.trim() || null) : null,
      };

      if (configurationId) {
        const { error } = await supabase
          .from('captcha_configurations')
          .update(payload)
          .eq('id', configurationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('captcha_configurations')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        configurationId = data.id;
      }

      if (form.secret_key.trim()) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-captcha', {
          body: { action: 'set_secret', configuration_id: configurationId, secret_key: form.secret_key.trim() },
        });
        if (fnError || !result?.ok) {
          throw new Error(result?.error ?? 'Could not store the secret key.');
        }
      }

      setDialogOpen(false);
      invalidate();
      toast({ title: form.id ? 'Configuration updated' : 'Configuration created' });
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message?: unknown }).message)
            : 'Unexpected error';
      toast({
        title: 'Could not save configuration',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    const { data, error } = await supabase.rpc('activate_captcha_configuration', { _id: id });
    if (error) {
      toast({ title: 'Could not activate', description: error.message, variant: 'destructive' });
      return;
    }
    void data;
    invalidate();
    toast({ title: 'Configuration activated' });
  };

  const remove = async (config: CaptchaConfiguration) => {
    if (config.is_active) {
      toast({
        title: 'Cannot delete active configuration',
        description: 'Activate another configuration first.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('captcha_configurations').delete().eq('id', config.id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    invalidate();
    toast({ title: 'Configuration deleted' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Security Verification (CAPTCHA)"
          description="Configure the CAPTCHA provider used on public registration and complaint forms."
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" /> CAPTCHA enforcement
            </CardTitle>
            <CardDescription>
              When enabled, public forms render the active provider widget and every challenge is
              verified on the server before submission is accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={enabled} disabled={savingToggle} onCheckedChange={toggleEnabled} />
              <span className="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
              {savingToggle && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {runtime?.misconfigured && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                CAPTCHA is enabled but no configuration is active. Public forms currently block
                submission — activate a configuration or disable enforcement.
              </p>
            )}
            {!enabled && (
              <p className="text-sm text-muted-foreground">
                With enforcement off, public forms are submitted without any bot protection.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Provider configurations</CardTitle>
              <CardDescription>Only one configuration can be active at a time.</CardDescription>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" /> Add configuration
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading configurations…</p>
            ) : configurations.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No CAPTCHA configuration yet. Add one to start protecting public forms.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Site key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configurations.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.name}</TableCell>
                      <TableCell>{CAPTCHA_PROVIDER_LABELS[config.provider]}</TableCell>
                      <TableCell className="capitalize">{config.environment}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {config.site_key.slice(0, 10)}…
                      </TableCell>
                      <TableCell>
                        {config.is_active ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(config.updated_at)}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {!config.is_active && (
                          <Button variant="outline" size="sm" onClick={() => activate(config.id)}>
                            Activate
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openEdit(config)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(config)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit configuration' : 'Add configuration'}</DialogTitle>
            <DialogDescription>
              The secret key is stored securely on the server and is never returned to the browser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="captcha-name">Name</Label>
              <Input
                id="captcha-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Public portal reCAPTCHA"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => setForm({ ...form, provider: v as CaptchaProvider })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CAPTCHA_PROVIDER_LABELS) as CaptchaProvider[]).map((p) => (
                      <SelectItem key={p} value={p}>{CAPTCHA_PROVIDER_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select
                  value={form.environment}
                  onValueChange={(v) => setForm({ ...form, environment: v as 'sandbox' | 'production' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="captcha-site-key">Site key</Label>
              <Input
                id="captcha-site-key"
                value={form.site_key}
                onChange={(e) => setForm({ ...form, site_key: e.target.value })}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="captcha-secret" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Secret key {form.id && '(leave blank to keep current)'}
              </Label>
              <Input
                id="captcha-secret"
                type="password"
                value={form.secret_key}
                onChange={(e) => setForm({ ...form, secret_key: e.target.value })}
                className="font-mono"
                autoComplete="new-password"
              />
            </div>

            {form.provider === 'recaptcha_v3' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="captcha-threshold">Score threshold (0–1)</Label>
                  <Input
                    id="captcha-threshold"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={form.score_threshold}
                    onChange={(e) => setForm({ ...form, score_threshold: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Challenges scoring below this value are rejected server-side.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="captcha-action">Expected action</Label>
                  <Input
                    id="captcha-action"
                    value={form.expected_action}
                    onChange={(e) => setForm({ ...form, expected_action: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="captcha-notes">Notes</Label>
              <Textarea
                id="captcha-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
