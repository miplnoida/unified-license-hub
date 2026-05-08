import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Save, ArrowLeft, Loader2, Info, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApplicationSettings, useSaveApplicationSettings, ApplicationSettings } from '@/hooks/useApplicationSettings';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function ApplicationFormSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: settings, isLoading } = useApplicationSettings();
  const saveMutation = useSaveApplicationSettings();
  const [form, setForm] = useState<ApplicationSettings>({
    allow_reapplication: true,
    allow_reapplication_after_final: true,
    notify_on_form_version_change: true,
    notification_channels: ['in_app', 'email'],
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  // Fetch published form versions with effective dates
  const { data: publishedVersions = [], isLoading: loadingVersions } = useQuery({
    queryKey: ['form_versions_published'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('form_versions')
        .select('id, version, semantic_version, status, effective_from, effective_until, published_at, created_at, template_id, form_templates!inner(name, form_type)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const updateVersionDates = useMutation({
    mutationFn: async ({ versionId, effective_from, effective_until }: { versionId: string; effective_from: string | null; effective_until: string | null }) => {
      const { error } = await (supabase
        .from('form_versions')
        .update({ effective_from, effective_until } as any)
        .eq('id', versionId) as any);
      if (error) throw error;
    },
    onSuccess: () => toast.success('Version dates updated'),
  });

  const notifyVersionChange = useMutation({
    mutationFn: async ({ templateName, semanticVersion }: { versionId: string; templateName: string; semanticVersion: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'form_version_update',
          title: `Form Updated: ${templateName}`,
          message: `A new version (${semanticVersion}) of "${templateName}" is now active. Please review any pending submissions.`,
          channels: form.notification_channels,
          broadcast: true,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Notification sent to all users'),
    onError: (e: any) => toast.error('Failed to send notification: ' + (e.message || 'Unknown error')),
  });

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(form);
      toast.success('Application & Form settings saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    }
  };

  const versionColumns: Column<any>[] = [
    { key: 'name', label: 'Form Name', render: (r) => r.form_templates?.name || '—' },
    { key: 'type', label: 'Type', render: (r) => <Badge variant="outline">{r.form_templates?.form_type || '—'}</Badge> },
    { key: 'version', label: 'Version', render: (r) => r.semantic_version || `v${r.version}` },
    {
      key: 'effective_from',
      label: 'Effective From',
      render: (r) => (
        <Input
          type="date"
          className="w-40"
          defaultValue={r.effective_from ? r.effective_from.split('T')[0] : ''}
          onBlur={(e) => {
            const val = e.target.value || null;
            updateVersionDates.mutate({ versionId: r.id, effective_from: val ? new Date(val).toISOString() : null, effective_until: r.effective_until });
          }}
        />
      ),
    },
    {
      key: 'effective_until',
      label: 'Effective Until',
      render: (r) => (
        <Input
          type="date"
          className="w-40"
          defaultValue={r.effective_until ? r.effective_until.split('T')[0] : ''}
          onBlur={(e) => {
            const val = e.target.value || null;
            updateVersionDates.mutate({ versionId: r.id, effective_from: r.effective_from, effective_until: val ? new Date(val).toISOString() : null });
          }}
        />
      ),
    },
    {
      key: 'notify',
      label: 'Notify',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          disabled={!form.notify_on_form_version_change}
          onClick={() => notifyVersionChange.mutate({
            versionId: r.id,
            templateName: r.form_templates?.name || 'Form',
            semanticVersion: r.semantic_version || `v${r.version}`,
          })}
        >
          <Bell className="h-3 w-3 mr-1" /> Send
        </Button>
      ),
    },
  ];

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
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Application & Form Settings"
          description="Configure re-application policies, form version management, and notification preferences."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        {/* Re-Application Control */}
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="text-base">Re-Application Control</CardTitle>
            <CardDescription>
              Control whether users can submit a new application when they already have an active (submitted/in-progress) application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="allow-reapp">Allow Re-Application</Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, users with an existing submitted or in-progress application cannot create a new one.
                </p>
              </div>
              <Switch
                id="allow-reapp"
                checked={form.allow_reapplication}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, allow_reapplication: v }))}
              />
            </div>
            {!form.allow_reapplication && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-sm">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Users will see a message explaining they cannot submit a new application while a previous one is still being processed.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Version Notifications */}
        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-base">Form Version Notifications</CardTitle>
            <CardDescription>
              Notify users when a new form version is activated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-version">Enable Version Change Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Send notifications via selected channels when a form version is manually activated.
                </p>
              </div>
              <Switch
                id="notify-version"
                checked={form.notify_on_form_version_change}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, notify_on_form_version_change: v }))}
              />
            </div>

            {form.notify_on_form_version_change && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Notification Channels</Label>
                  <div className="flex gap-3">
                    {(['in_app', 'email'] as const).map((ch) => (
                      <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-input"
                          checked={form.notification_channels.includes(ch)}
                          onChange={(e) => {
                            setForm(prev => ({
                              ...prev,
                              notification_channels: e.target.checked
                                ? [...prev.notification_channels, ch]
                                : prev.notification_channels.filter(c => c !== ch),
                            }));
                          }}
                        />
                        {ch === 'in_app' ? 'In-App' : 'Email'}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Published Form Versions */}
        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-base">Published Form Versions</CardTitle>
            <CardDescription>
              Manage effective date ranges for published form versions. Only published versions appear here. Set dates and manually send notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingVersions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : publishedVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No published form versions found.</p>
            ) : (
              <DataTableShell
                columns={versionColumns}
                data={publishedVersions}
                searchPlaceholder="Search form versions..."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
