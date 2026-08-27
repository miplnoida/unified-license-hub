import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, Trash2, Settings2, Lock, AlertTriangle, Loader2, Search } from 'lucide-react';
import {
  useEventConfigs,
  useEventChannelTemplates,
  useNotificationTemplateList,
  useRecipientRuleTypes,
  useSaveEventConfig,
  useSetEventActive,
  useValidateRecipientRules,
  useChannelHealth,
  CHANNEL_LABELS,
  type NotificationEventConfigRow,
} from '@/hooks/useNotificationAdmin';
import { WORKFLOW_STAGE_EVENTS } from '@/lib/notifications/workflowStageEvents';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const FREQUENCIES = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily digest' },
];

interface RuleRow {
  type: string;
  role?: string;
  user_id?: string;
  regulator_id?: string;
  email?: string;
}

interface EventForm {
  id: string | null;
  event_key: string;
  description: string;
  module: string;
  category: string;
  severity: string;
  action_required: boolean;
  system_required: boolean;
  allow_mute: boolean;
  channels: string[];
  delivery_frequency: string;
  dedupe_window_seconds: number;
  escalate_after_minutes: number;
  escalate_to_role: string;
  is_active: boolean;
  rules: RuleRow[];
  channelTemplates: Record<string, string>;
}

const EMPTY: EventForm = {
  id: null,
  event_key: '',
  description: '',
  module: '',
  category: 'info',
  severity: 'medium',
  action_required: false,
  system_required: false,
  allow_mute: true,
  channels: ['in_app'],
  delivery_frequency: 'immediate',
  dedupe_window_seconds: 0,
  escalate_after_minutes: 0,
  escalate_to_role: '',
  is_active: true,
  rules: [],
  channelTemplates: {},
};

/**
 * FRD Event Configuration — binds a business event to channels, recipient
 * rules, templates, delivery frequency and failure escalation. This is the
 * configuration the dispatcher reads at runtime, so what is set here is
 * exactly what gets delivered.
 */
export default function NotificationEvents() {
  const { data: events = [], isLoading } = useEventConfigs();
  const { data: bindings = [] } = useEventChannelTemplates();
  const { data: templates = [] } = useNotificationTemplateList();
  const { data: ruleTypes = [] } = useRecipientRuleTypes();
  const health = useChannelHealth();

  const saveEvent = useSaveEventConfig();
  const setActive = useSetEventActive();
  const validateRules = useValidateRecipientRules();

  const [search, setSearch] = useState('');
  const [form, setForm] = useState<EventForm>(EMPTY);
  const [open, setOpen] = useState(false);
  const [ruleErrors, setRuleErrors] = useState<string[]>([]);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.status === 'active'),
    [templates],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.event_key.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.module || '').toLowerCase().includes(q),
    );
  }, [events, search]);

  const workflowKeys = new Set(WORKFLOW_STAGE_EVENTS.map((s) => s.eventKey));

  const openEdit = (row: NotificationEventConfigRow) => {
    const rules: RuleRow[] = Array.isArray(row.recipient_rules) ? row.recipient_rules : [];
    const escalation = (row.failure_escalation || {}) as any;
    const channelTemplates: Record<string, string> = {};
    for (const b of bindings.filter((b) => b.event_config_id === row.id)) {
      channelTemplates[b.channel] = b.template_id;
    }
    setForm({
      id: row.id,
      event_key: row.event_key,
      description: row.description || '',
      module: row.module || '',
      category: row.category || 'info',
      severity: row.severity || 'medium',
      action_required: !!row.action_required,
      system_required: !!row.system_required,
      allow_mute: row.allow_mute !== false,
      channels: Array.isArray(row.channels) && row.channels.length ? row.channels : ['in_app'],
      delivery_frequency: row.delivery_frequency || 'immediate',
      dedupe_window_seconds: row.dedupe_window_seconds ?? 0,
      escalate_after_minutes: Number(escalation.after_minutes || 0),
      escalate_to_role: String(escalation.notify_role || ''),
      is_active: row.is_active !== false,
      rules,
      channelTemplates,
    });
    setRuleErrors([]);
    setOpen(true);
  };

  const openCreate = () => {
    setForm(EMPTY);
    setRuleErrors([]);
    setOpen(true);
  };

  const toggleChannel = (channel: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const criticalLock = form.severity === 'critical' || form.severity === 'high';

  const handleSave = async () => {
    if (!form.event_key.trim()) return toast.error('Event key is required');
    if (form.channels.length === 0) return toast.error('Select at least one channel');

    const cleanRules = form.rules.filter((r) => r.type);
    if (cleanRules.length === 0) return toast.error('Add at least one recipient rule');

    try {
      const validation = await validateRules.mutateAsync(cleanRules);
      if (!validation.valid) {
        setRuleErrors(validation.errors.map((e) => `Rule ${e.index + 1}: ${e.error}`));
        return toast.error('Recipient rules are invalid');
      }
      setRuleErrors([]);

      await saveEvent.mutateAsync({
        id: form.id,
        event_key: form.event_key.trim(),
        description: form.description.trim() || null,
        module: form.module.trim() || null,
        category: form.category,
        severity: form.severity,
        action_required: form.action_required,
        system_required: form.system_required,
        allow_mute: criticalLock ? false : form.allow_mute,
        channels: form.channels,
        recipient_rules: cleanRules,
        delivery_frequency: criticalLock ? 'immediate' : form.delivery_frequency,
        dedupe_window_seconds: form.dedupe_window_seconds || 0,
        failure_escalation:
          form.escalate_after_minutes > 0
            ? { after_minutes: form.escalate_after_minutes, notify_role: form.escalate_to_role || 'admin' }
            : {},
        is_active: form.is_active,
        channel_templates: form.channelTemplates,
      });
      toast.success('Event configuration saved');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Notification Events"
        description="Configure which events notify whom, on which channels, with which template."
        actions={
          <Button data-rbac="notification_management.manage_events" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New event
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((ev) => {
            const bound = bindings.filter((b) => b.event_config_id === ev.id);
            return (
              <Card key={ev.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="font-mono">{ev.event_key}</span>
                        {workflowKeys.has(ev.event_key) && <Badge variant="outline">Workflow</Badge>}
                        {ev.system_required && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="gap-1">
                                  <Lock className="h-3 w-3" /> Required
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Regulatory notification — recipients cannot mute this event.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </CardTitle>
                      <CardDescription>{ev.description || 'No description'}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        data-rbac="notification_management.manage_events"
                        checked={ev.is_active !== false}
                        onCheckedChange={(checked) =>
                          setActive
                            .mutateAsync({ configId: ev.id, active: checked })
                            .then(() => toast.success(checked ? 'Event enabled' : 'Event disabled'))
                            .catch((e: any) => toast.error(e?.message || 'Update failed'))
                        }
                      />
                      <Button data-rbac="notification_management.dispatch" variant="outline" size="sm" onClick={() => openEdit(ev)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Configure
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs">
                  <Badge variant="secondary">{ev.severity}</Badge>
                  <Badge variant="outline">{ev.delivery_frequency || 'immediate'}</Badge>
                  {(ev.channels || []).map((c) => (
                    <Badge key={c} variant="outline">{CHANNEL_LABELS[c] || c}</Badge>
                  ))}
                  <span className="text-muted-foreground">
                    {Array.isArray(ev.recipient_rules) ? ev.recipient_rules.length : 0} recipient rule(s)
                  </span>
                  <span className="text-muted-foreground">· {bound.length} template binding(s)</span>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No events match your search.</p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Configure event' : 'New event'}</DialogTitle>
            <DialogDescription>
              These settings drive live delivery: channels, recipients, templates, frequency and escalation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Event key *</Label>
                <Input
                  value={form.event_key}
                  disabled={!!form.id}
                  placeholder="module.event_name"
                  onChange={(e) => setForm({ ...form, event_key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <Input value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delivery frequency</Label>
                <Select
                  value={criticalLock ? 'immediate' : form.delivery_frequency}
                  onValueChange={(v) => setForm({ ...form, delivery_frequency: v })}
                  disabled={criticalLock}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {criticalLock && (
                  <p className="text-xs text-muted-foreground">
                    Critical and high severity events are always delivered immediately.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Duplicate suppression (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.dedupe_window_seconds}
                  onChange={(e) => setForm({ ...form, dedupe_window_seconds: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.action_required}
                  onCheckedChange={(c) => setForm({ ...form, action_required: !!c })}
                />
                Action required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.system_required}
                  onCheckedChange={(c) => setForm({ ...form, system_required: !!c })}
                />
                Regulatory / system required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={criticalLock ? false : form.allow_mute}
                  disabled={criticalLock || form.system_required}
                  onCheckedChange={(c) => setForm({ ...form, allow_mute: !!c })}
                />
                Recipients may mute
              </label>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Channels and templates</Label>
              {Object.keys(CHANNEL_LABELS).map((channel) => {
                const enabled = form.channels.includes(channel);
                const channelAvailable = (health as any)[channel]?.available !== false;
                return (
                  <div key={channel} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                    <label className="flex w-32 items-center gap-2 text-sm">
                      <Checkbox checked={enabled} onCheckedChange={() => toggleChannel(channel)} />
                      {CHANNEL_LABELS[channel]}
                    </label>
                    {!channelAvailable && (
                      <Badge variant="destructive">
                        {channel === 'sms' ? 'SMS unavailable' : 'Not configured'}
                      </Badge>
                    )}
                    <Select
                      value={form.channelTemplates[channel] || 'none'}
                      onValueChange={(v) =>
                        setForm((prev) => ({
                          ...prev,
                          channelTemplates: { ...prev.channelTemplates, [channel]: v === 'none' ? '' : v },
                        }))
                      }
                      disabled={!enabled}
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder="Use default content" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use default content</SelectItem>
                        {activeTemplates
                          .filter((t) => t.channel === channel)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name} (v{t.published_version ?? t.version})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Recipient rules</Label>
                <Button data-rbac="notification_management.dispatch"
                  size="sm"
                  variant="outline"
                  onClick={() => setForm((prev) => ({ ...prev, rules: [...prev.rules, { type: '' }] }))}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add rule
                </Button>
              </div>

              {ruleErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {ruleErrors.map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {form.rules.map((rule, idx) => {
                const spec = ruleTypes.find((r) => r.type === rule.type);
                const requires = spec?.requires || [];
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <Select
                      value={rule.type || 'none'}
                      onValueChange={(v) =>
                        setForm((prev) => {
                          const next = [...prev.rules];
                          next[idx] = { type: v === 'none' ? '' : v };
                          return { ...prev, rules: next };
                        })
                      }
                    >
                      <SelectTrigger className="w-64"><SelectValue placeholder="Select rule" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select rule</SelectItem>
                        {ruleTypes.map((r) => (
                          <SelectItem key={r.type} value={r.type}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {requires.map((field) => (
                      <Input
                        key={field}
                        className="w-56"
                        placeholder={field}
                        value={(rule as any)[field] || ''}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.rules];
                            next[idx] = { ...next[idx], [field]: e.target.value };
                            return { ...prev, rules: next };
                          })
                        }
                      />
                    ))}

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== idx) }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
              {form.rules.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No recipient rules yet — this event would notify nobody.
                </p>
              )}
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Escalate after (minutes, 0 = off)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.escalate_after_minutes}
                  onChange={(e) => setForm({ ...form, escalate_after_minutes: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Escalate to role</Label>
                <Input
                  value={form.escalate_to_role}
                  placeholder="admin"
                  onChange={(e) => setForm({ ...form, escalate_to_role: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-rbac="notification_management.manage_events"
              onClick={handleSave}
              disabled={saveEvent.isPending || validateRules.isPending}
            >
              {(saveEvent.isPending || validateRules.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
