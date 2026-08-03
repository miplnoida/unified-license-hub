import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { TemplatePreviewDialog } from '@/components/notifications/TemplatePreviewDialog';
import { toast } from 'sonner';
import { Plus, Eye, Copy, Send, Archive, CheckCircle2, History, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useNotificationTemplateList,
  useSaveTemplate,
  usePublishTemplate,
  useArchiveTemplate,
  useCloneTemplate,
  useTemplateVersions,
  useEventConfigs,
  useChannelHealth,
  unresolvedTokens,
  CHANNEL_LABELS,
  type NotificationTemplateRow,
} from '@/hooks/useNotificationAdmin';

const MERGE_FIELDS = [
  'recipient_name', 'recipient_email', 'entity_name', 'application_number', 'license_number',
  'return_name', 'complaint_number', 'reference', 'due_date', 'amount', 'status',
  'regulator_name', 'period', 'deadline', 'action_url', 'app_name', 'app_url',
];

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  draft: 'secondary',
  archived: 'outline',
};

interface FormState {
  id: string | null;
  name: string;
  template_code: string;
  module: string;
  event_key: string;
  channel: string;
  severity: string;
  subject: string;
  body: string;
  variables: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  template_code: '',
  module: '',
  event_key: '',
  channel: 'email',
  severity: 'medium',
  subject: '',
  body: '',
  variables: '',
};

/**
 * FRD screen R-01 — Notification Template administration.
 *
 * Single source of truth for notification content: draft → publish with an
 * immutable version snapshot per publish, clone for variants, archive instead
 * of delete (history must stay readable), and preview / test-send before use.
 */
export default function NotificationTemplates() {
  const { data: templates = [], isLoading } = useNotificationTemplateList();
  const { data: events = [] } = useEventConfigs();
  const health = useChannelHealth();

  const save = useSaveTemplate();
  const publish = usePublishTemplate();
  const archive = useArchiveTemplate();
  const clone = useCloneTemplate();

  const [tab, setTab] = useState('active');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<NotificationTemplateRow | null>(null);
  const [versionsFor, setVersionsFor] = useState<NotificationTemplateRow | null>(null);
  const { data: versions = [], isLoading: versionsLoading } = useTemplateVersions(versionsFor?.id ?? null);

  const filtered = useMemo(() => {
    if (tab === 'all') return templates;
    return templates.filter((t) => (t.status || 'draft') === tab);
  }, [templates, tab]);

  const declaredVariables = useMemo(
    () => form.variables.split(',').map((v) => v.trim()).filter(Boolean),
    [form.variables],
  );
  const missingTokens = useMemo(
    () => unresolvedTokens(form.body, declaredVariables, form.subject),
    [form.body, form.subject, declaredVariables],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (row: NotificationTemplateRow) => {
    setForm({
      id: row.id,
      name: row.name || '',
      template_code: row.template_code || '',
      module: row.module || '',
      event_key: row.event_key || row.event_type || '',
      channel: row.channel || 'email',
      severity: row.severity || 'medium',
      subject: row.subject || '',
      body: row.body || '',
      variables: Array.isArray(row.variables) ? (row.variables as unknown[]).map(String).join(', ') : '',
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Template name is required');
    if (!form.body.trim()) return toast.error('Template body is required');
    if (form.channel !== 'in_app' && !form.subject.trim()) {
      return toast.error('Subject is required for email and SMS templates');
    }
    try {
      await save.mutateAsync({
        id: form.id,
        name: form.name.trim(),
        template_code: form.template_code.trim() || null,
        module: form.module.trim() || null,
        event_key: form.event_key || null,
        channel: form.channel,
        severity: form.severity,
        subject: form.subject.trim() || null,
        body: form.body,
        variables: declaredVariables,
      });
      toast.success(form.id ? 'Template updated as a new draft revision' : 'Template created');
      setEditorOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const handlePublish = async (row: NotificationTemplateRow) => {
    try {
      await publish.mutateAsync(row.id);
      toast.success(`Published ${row.name} — version snapshot recorded`);
    } catch (e: any) {
      toast.error(e?.message || 'Publish failed');
    }
  };

  const handleArchive = async (row: NotificationTemplateRow, archived: boolean) => {
    try {
      await archive.mutateAsync({ templateId: row.id, archive: archived });
      toast.success(archived ? 'Template archived' : 'Template restored to draft');
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    }
  };

  const handleClone = async (row: NotificationTemplateRow) => {
    try {
      await clone.mutateAsync({ templateId: row.id });
      toast.success('Template cloned as a new draft');
    } catch (e: any) {
      toast.error(e?.message || 'Clone failed');
    }
  };

  const columns: Column<NotificationTemplateRow>[] = [
    {
      key: 'name',
      label: 'Template',
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.template_code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'event_key',
      label: 'Event',
      render: (row) => <span className="text-sm">{row.event_key || row.event_type || '—'}</span>,
    },
    {
      key: 'channel',
      label: 'Channel',
      render: (row) => <Badge variant="outline">{CHANNEL_LABELS[row.channel] || row.channel}</Badge>,
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => <Badge variant="secondary">{row.severity}</Badge>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[row.status] || 'secondary'}>{row.status}</Badge>
          <span className="text-xs text-muted-foreground">
            v{row.version}{row.published_version ? ` (live v${row.published_version})` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <RowActionsMenu
          actions={[
            { label: 'Edit', onClick: () => openEdit(row) },
            { label: 'Preview / test send', icon: Eye, onClick: () => setPreviewTarget(row) },
            { label: 'Version history', icon: History, onClick: () => setVersionsFor(row) },
            { label: 'Clone', icon: Copy, onClick: () => handleClone(row) },
            ...(row.status !== 'active'
              ? [{ label: 'Publish', icon: CheckCircle2, onClick: () => handlePublish(row) }]
              : []),
            row.status === 'archived'
              ? { label: 'Restore to draft', icon: Archive, onClick: () => handleArchive(row, false) }
              : { label: 'Archive', icon: Archive, onClick: () => handleArchive(row, true), destructive: true },
          ]}
        />
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Notification Templates"
        description="Draft, version, publish and test the content used for every notification channel."
        actions={
          <Button data-rbac="notification_management.manage_templates" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New template
          </Button>
        }
      />

      {!health.email.available && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Email delivery is not configured, so email templates will queue but not send. Configure SMTP in Settings.
          </AlertDescription>
        </Alert>
      )}
      {!health.sms.available && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>SMS is unavailable — no SMS provider is configured for this environment.</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
                </div>
              ) : (
                <DataTableShell
                  columns={columns}
                  data={filtered}
                  searchPlaceholder="Search templates by name, code or event…"
                  pageSize={15}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>
              Saving creates a new draft revision. Published versions are immutable and remain
              attached to notifications already sent.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Template name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Template code</Label>
                <Input
                  value={form.template_code}
                  placeholder="e.g. APP_SUBMITTED_EMAIL"
                  onChange={(e) => setForm({ ...form, template_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <Input
                  value={form.module}
                  placeholder="e.g. application_management"
                  onChange={(e) => setForm({ ...form, module: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Event</Label>
                <Select value={form.event_key || 'none'} onValueChange={(v) => setForm({ ...form, event_key: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not bound to an event</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.event_key}>{ev.event_key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel *</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.channel !== 'in_app' && (
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea
                rows={10}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Declared merge fields (comma separated)</Label>
              <Input
                value={form.variables}
                placeholder="recipient_name, application_number"
                onChange={(e) => setForm({ ...form, variables: e.target.value })}
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {MERGE_FIELDS.map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 font-mono text-xs"
                    onClick={() => setForm((prev) => ({ ...prev, body: `${prev.body}{{${f}}}` }))}
                  >
                    {`{{${f}}}`}
                  </Button>
                ))}
              </div>
            </div>

            {missingTokens.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  These tokens are used but not declared: {missingTokens.join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button data-rbac="notification_management.manage_templates" onClick={handleSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={!!versionsFor} onOpenChange={(o) => !o && setVersionsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version history — {versionsFor?.name}</DialogTitle>
            <DialogDescription>Every publish is stored as an immutable snapshot.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {versionsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!versionsLoading && versions.length === 0 && (
              <p className="text-sm text-muted-foreground">This template has never been published.</p>
            )}
            {versions.map((v: any) => (
              <Card key={v.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Version {v.version}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {v.published_at ? new Date(v.published_at).toLocaleString() : ''}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {v.subject && <p className="font-medium">{v.subject}</p>}
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">{v.body}</pre>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionsFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplatePreviewDialog
        template={previewTarget}
        open={!!previewTarget}
        onOpenChange={(o) => !o && setPreviewTarget(null)}
      />
    </DashboardLayout>
  );
}
