/**
 * Per-action notification editor — used inside the workflow step builder.
 *
 * For each allowed_action on a step, admins can attach one or more
 * (event_key, recipient_type, template) bindings. At runtime
 * perform-workflow-action reads these from approval_action_notifications
 * and fans out one dispatch-notification-event call per enabled row.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronDown, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  useActionNotifications,
  useNotificationTemplates,
  useUpsertActionNotification,
  useDeleteActionNotification,
  getDefaultEventForAction,
  pickDefaultEmailTemplateId,
  RECIPIENT_LABELS,
  normalizeRecipientConfig,
  type ActionNotification,
  type ActionNotificationRecipientType,
  type WorkflowEntityKind,
} from '@/hooks/useActionNotifications';
import {
  ACTION_LABELS,
  type WorkflowActionType,
} from '@/hooks/useWorkflowEngine';
import { useRoles } from '@/hooks/useRoles';

interface Props {
  stepId: string;
  allowedActions: WorkflowActionType[];
  readOnly?: boolean;
  /**
   * Workflow entity type — drives entity-aware default event keys and filters
   * the event dropdown to the matching prefix (application/registration/return).
   * Defaults to `application` for back-compat.
   */
  entityType?: string;
}

const RECIPIENT_OPTIONS: ActionNotificationRecipientType[] = [
  'applicant',
  'current_approver',
  'previous_actor',
  'role',
  'admin',
  'custom_email',
];

const EVENT_LABELS: Record<string, string> = {
  'application.approved_step': 'Application · Approved at Step',
  'application.rejected': 'Application · Rejected',
  'application.send_back': 'Application · Sent Back',
  'application.escalated': 'Application · Escalated',
  'application.resubmission_requested': 'Application · Resubmission Requested',
  'application.returned_for_correction': 'Application · Returned for Correction',
  'application.more_info_requested': 'Application · More Information Requested',
  'application.workflow_action_taken': 'Application · Generic Workflow Action',
  'registration.approved_step': 'Registration · Approved at Step',
  'registration.rejected': 'Registration · Rejected',
  'registration.send_back': 'Registration · Sent Back',
  'registration.escalated': 'Registration · Escalated',
  'registration.resubmission_requested': 'Registration · Resubmission Requested',
  'registration.returned_for_correction': 'Registration · Returned for Correction',
  'registration.more_info_requested': 'Registration · More Information Requested',
  'registration.workflow_action_taken': 'Registration · Generic Workflow Action',
  'return.approved_step': 'Return · Approved at Step',
  'return.approved': 'Return · Fully Approved',
  'return.rejected': 'Return · Rejected',
  'return.send_back': 'Return · Sent Back',
  'return.edit_requested': 'Return · Edit Requested',
  'return.workflow_action_taken': 'Return · Generic Workflow Action',
};

function resolveEntityKind(entityType: string | undefined): WorkflowEntityKind {
  if (entityType === 'registration' || entityType === 'return') return entityType;
  return 'application';
}

type NotificationRowDraft = {
  id?: string;
  action_type: WorkflowActionType;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_config: Record<string, unknown>;
  recipient_config_text: string;
  recipient_config_error: string | null;
  template_id: string | null;
  is_enabled: boolean;
};

function createDraft(
  action: WorkflowActionType,
  entityKind: WorkflowEntityKind,
  templates: Array<{ id: string; event_type: string; channel: string; is_active: boolean }> = [],
  row?: ActionNotification,
): NotificationRowDraft {
  const recipientConfig = normalizeRecipientConfig(row?.recipient_type ?? 'applicant', row?.recipient_config ?? {});
  const eventKey = row?.event_key ?? getDefaultEventForAction(action, entityKind);
  return {
    id: row?.id,
    action_type: action,
    event_key: eventKey,
    recipient_type: row?.recipient_type ?? 'applicant',
    recipient_config: recipientConfig,
    recipient_config_text: JSON.stringify(recipientConfig, null, 2),
    recipient_config_error: null,
    template_id: row?.template_id ?? pickDefaultEmailTemplateId(eventKey, templates),
    is_enabled: row?.is_enabled ?? true,
  };
}

function getDraftKey(action: WorkflowActionType, rowId?: string) {
  return `${action}:${rowId ?? 'new'}`;
}

function recipientConfigHelpText(recipientType: ActionNotificationRecipientType) {
  if (recipientType === 'role') return 'Choose which role should receive this template.';
  if (recipientType === 'custom_email') return 'Enter the destination email address.';
  return 'Optional recipient details as JSON for advanced routing.';
}

function formatEventLabel(eventKey: string) {
  return EVENT_LABELS[eventKey] ?? eventKey;
}

function getEventOptions(
  action: WorkflowActionType,
  entityKind: WorkflowEntityKind,
  templates: Array<{ event_type: string }>,
  currentEventKey?: string | null,
) {
  const prefix = `${entityKind}.`;
  const options = new Set<string>([
    getDefaultEventForAction(action, entityKind),
    // Include all labelled events for this entity kind so admins can pick e.g.
    // a generic "workflow_action_taken" template even when it isn't the default.
    ...Object.keys(EVENT_LABELS).filter((k) => k.startsWith(prefix)),
    // Templates whose event_type matches this entity kind become selectable too.
    ...templates.map((template) => template.event_type).filter((k) => k && k.startsWith(prefix)),
  ]);

  if (currentEventKey?.trim()) {
    // Preserve whatever is currently saved, even if it's cross-entity legacy data.
    options.add(currentEventKey.trim());
  }

  return Array.from(options)
    .sort((a, b) => formatEventLabel(a).localeCompare(formatEventLabel(b)))
    .map((eventKey) => ({
      value: eventKey,
      label: formatEventLabel(eventKey),
    }));
}

export function ActionNotificationsEditor({ stepId, allowedActions, readOnly = false, entityType }: Props) {
  const entityKind = resolveEntityKind(entityType);
  const { data: rows = [], isLoading } = useActionNotifications(stepId);
  const { data: templates = [] } = useNotificationTemplates();
  const { data: roles = [] } = useRoles();
  const upsert = useUpsertActionNotification(stepId);
  const del = useDeleteActionNotification(stepId);
  const [openAction, setOpenAction] = useState<WorkflowActionType | null>(null);
  const [drafts, setDrafts] = useState<Record<string, NotificationRowDraft>>({});
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const m = new Map<WorkflowActionType, typeof rows>();
    for (const a of allowedActions) m.set(a, []);
    for (const r of rows) {
      const list = m.get(r.action_type) ?? [];
      list.push(r);
      m.set(r.action_type, list);
    }
    return m;
  }, [rows, allowedActions]);

  if (!allowedActions.length) {
    return (
      <div className="text-sm text-muted-foreground italic px-3 py-2">
        Enable at least one action above to configure notifications.
      </div>
    );
  }

  const setDraft = (key: string, next: NotificationRowDraft) => {
    setDrafts((prev) => ({ ...prev, [key]: next }));
  };

  const startEditing = (action: WorkflowActionType, row?: ActionNotification) => {
    const key = getDraftKey(action, row?.id);
    setDraft(key, createDraft(action, entityKind, templates, row));
    setEditingRows((prev) => ({ ...prev, [key]: true }));
  };

  const cancelEditing = (action: WorkflowActionType, rowId?: string) => {
    const key = getDraftKey(action, rowId);
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveDraft = async (action: WorkflowActionType, rowId?: string) => {
    const key = getDraftKey(action, rowId);
    const draft = drafts[key];
    if (!draft) return;
    if (draft.recipient_config_error) return;
    await upsert.mutateAsync(draft);
    cancelEditing(action, rowId);
  };

  const updateDraftEventKey = (key: string, draft: NotificationRowDraft, eventKey: string) => {
    setDraft(key, {
      ...draft,
      event_key: eventKey,
      template_id: pickDefaultEmailTemplateId(eventKey, templates),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
        <div>
          <p className="text-sm font-medium">Action configuration</p>
          <p className="text-[11px] text-muted-foreground">Open an action to manage all notification bindings for that step action.</p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {allowedActions.length} action{allowedActions.length === 1 ? '' : 's'} enabled
        </Badge>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 px-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      )}

      {allowedActions.map((action) => {
        const list = grouped.get(action) ?? [];
        const isOpen = openAction === action;
        return (
          <Collapsible
            key={action}
            open={isOpen}
            onOpenChange={(next) => setOpenAction(next ? action : null)}
            className="rounded-md border bg-background"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{ACTION_LABELS[action]}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {list.length} notification{list.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Notifications configured here run whenever this action is performed on the step.
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">Notifications</p>
                    <p className="text-[11px] text-muted-foreground">Add multiple bindings with different events, recipients, templates, and enabled states.</p>
                  </div>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => startEditing(action)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Notification
                    </Button>
                  )}
                </div>

                {list.length === 0 && !editingRows[getDraftKey(action)] && (
                  <div className="rounded-md border border-dashed px-3 py-4 text-xs italic text-muted-foreground">
                    No notification bindings configured for this action.
                  </div>
                )}

                {list.map((row) => (
                  (() => {
                    const key = getDraftKey(action, row.id);
                    const isEditingRow = editingRows[key] === true;
                    const draft = drafts[key] ?? createDraft(action, entityKind, templates, row);
                    const roleValue = typeof draft.recipient_config.role === 'string'
                      ? draft.recipient_config.role
                      : typeof draft.recipient_config.role_name === 'string'
                        ? draft.recipient_config.role_name
                        : 'none';
                    const emailValue = typeof draft.recipient_config.email === 'string'
                      ? draft.recipient_config.email
                      : '';
                    const genericConfigValue = draft.recipient_config_text;
                    const eventOptions = getEventOptions(action, entityKind, templates, draft.event_key);
                    const templateOptions = templates.filter((t) => (
                      t.channel === 'email' && (t.event_type === draft.event_key || t.id === row.template_id)
                    ));

                    return (
                      <div key={row.id} className="rounded-md border bg-muted/20 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {RECIPIENT_LABELS[row.recipient_type]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{row.event_key}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={isEditingRow ? draft.is_enabled : row.is_enabled}
                                disabled={readOnly || upsert.isPending}
                                onCheckedChange={(checked) => {
                                  if (isEditingRow) {
                                    setDraft(key, { ...draft, is_enabled: checked });
                                    return;
                                  }
                                  upsert.mutate({
                                    id: row.id,
                                    action_type: row.action_type,
                                    event_key: row.event_key,
                                    recipient_type: row.recipient_type,
                                    recipient_config: row.recipient_config,
                                    template_id: row.template_id,
                                    is_enabled: checked,
                                  });
                                }}
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {(isEditingRow ? draft.is_enabled : row.is_enabled) ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            {!readOnly && !isEditingRow && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => startEditing(action, row)}
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Button>
                            )}
                            {!readOnly && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  if (isEditingRow) {
                                    cancelEditing(action, row.id);
                                    return;
                                  }
                                  del.mutate(row.id);
                                }}
                                aria-label={isEditingRow ? 'Cancel edit' : 'Delete notification'}
                              >
                                {isEditingRow ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </div>

                          {isEditingRow ? (
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                              <div className="md:col-span-3">
                                <Label className="text-[11px]">Event key</Label>
                                <Select
                                  value={draft.event_key}
                                  onValueChange={(value) => updateDraftEventKey(key, draft, value)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select event" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {eventOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value} className="text-xs">
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="md:col-span-3">
                                <Label className="text-[11px]">Recipient type</Label>
                                  <Select
                                  value={draft.recipient_type}
                                  onValueChange={(v) => setDraft(key, {
                                    ...draft,
                                    recipient_type: v as ActionNotificationRecipientType,
                                    recipient_config: normalizeRecipientConfig(v as ActionNotificationRecipientType, draft.recipient_config),
                                      recipient_config_text: JSON.stringify(
                                        normalizeRecipientConfig(v as ActionNotificationRecipientType, draft.recipient_config),
                                        null,
                                        2,
                                      ),
                                      recipient_config_error: null,
                                  })}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {RECIPIENT_OPTIONS.map((r) => (
                                      <SelectItem key={r} value={r} className="text-xs">
                                        {RECIPIENT_LABELS[r]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="md:col-span-3">
                                <Label className="text-[11px]">Template</Label>
                                <Select
                                  value={draft.template_id ?? 'none'}
                                  onValueChange={(v) => setDraft(key, { ...draft, template_id: v === 'none' ? null : v })}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick template" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none" className="text-xs">— Use event default —</SelectItem>
                                    {templateOptions.map((t) => (
                                      <SelectItem key={t.id} value={t.id} className="text-xs">
                                        {t.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="md:col-span-3">
                                <Label className="text-[11px]">Enabled</Label>
                                <div className="h-8 px-2 border rounded-md flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Dispatch this row</span>
                                  <Switch
                                    checked={draft.is_enabled}
                                    onCheckedChange={(checked) => setDraft(key, { ...draft, is_enabled: checked })}
                                  />
                                </div>
                              </div>

                              <div className="md:col-span-12 space-y-2">
                                <Label className="text-[11px]">Recipient details</Label>
                                {draft.recipient_type === 'role' ? (
                                  <Select
                                    value={roleValue || 'none'}
                                    onValueChange={(v) => setDraft(key, {
                                      ...draft,
                                       recipient_config: v === 'none' ? {} : { role: v, role_name: v },
                                      recipient_config_text: JSON.stringify(v === 'none' ? {} : { role: v, role_name: v }, null, 2),
                                      recipient_config_error: null,
                                    })}
                                  >
                                    <SelectTrigger className="h-8 text-xs max-w-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none" className="text-xs">Select role</SelectItem>
                                      {roles.map((role) => (
                                        <SelectItem key={role.id} value={role.name} className="text-xs">
                                          {role.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : draft.recipient_type === 'custom_email' ? (
                                  <Input
                                    className="h-8 text-xs max-w-sm"
                                    type="email"
                                    placeholder="name@example.com"
                                    value={emailValue}
                                    onChange={(e) => setDraft(key, {
                                      ...draft,
                                      recipient_config: { email: e.target.value },
                                      recipient_config_text: JSON.stringify({ email: e.target.value }, null, 2),
                                      recipient_config_error: null,
                                    })}
                                  />
                                ) : (
                                  <Textarea
                                    className="min-h-[96px] text-xs font-mono"
                                    value={genericConfigValue}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      let parsedConfig = draft.recipient_config;
                                      let error: string | null = null;
                                      try {
                                        parsedConfig = next.trim() ? JSON.parse(next) : {};
                                      } catch {
                                        error = 'Recipient details must be valid JSON.';
                                      }
                                      setDraft(key, {
                                        ...draft,
                                        recipient_config_text: next,
                                        recipient_config: parsedConfig,
                                        recipient_config_error: error,
                                      });
                                    }}
                                  />
                                )}
                                {draft.recipient_config_error && (
                                  <p className="text-[11px] text-destructive">{draft.recipient_config_error}</p>
                                )}
                                <p className="text-[11px] text-muted-foreground">
                                  {recipientConfigHelpText(draft.recipient_type)}
                                </p>
                              </div>

                              <div className="md:col-span-12 flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  onClick={() => cancelEditing(action, row.id)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs"
                                  disabled={upsert.isPending}
                                  onClick={() => saveDraft(action, row.id)}
                                >
                                  <Save className="h-3.5 w-3.5" /> Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">Template</div>
                                <div>{templates.find((t) => t.id === row.template_id)?.name ?? 'Event default'}</div>
                              </div>
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">Recipient details</div>
                                <div className="break-all">
                                  {row.recipient_type === 'role'
                                    ? (typeof row.recipient_config?.role === 'string' ? row.recipient_config.role : typeof row.recipient_config?.role_name === 'string' ? row.recipient_config.role_name : '—')
                                    : row.recipient_type === 'custom_email'
                                      ? (typeof row.recipient_config?.email === 'string' ? row.recipient_config.email : '—')
                                      : Object.keys(row.recipient_config ?? {}).length > 0
                                        ? JSON.stringify(row.recipient_config)
                                        : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">Row state</div>
                                <div>{row.is_enabled ? 'Enabled' : 'Disabled'}</div>
                              </div>
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">Runtime</div>
                                <div>Dispatches when this step action runs.</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                ))}

                {!readOnly && editingRows[getDraftKey(action)] && (() => {
                  const key = getDraftKey(action);
                  const draft = drafts[key] ?? createDraft(action, entityKind, templates);
                  const roleValue = typeof draft.recipient_config.role === 'string'
                    ? draft.recipient_config.role
                    : typeof draft.recipient_config.role_name === 'string'
                      ? draft.recipient_config.role_name
                      : 'none';
                  const emailValue = typeof draft.recipient_config.email === 'string'
                    ? draft.recipient_config.email
                    : '';
                  const genericConfigValue = draft.recipient_config_text;
                  const eventOptions = getEventOptions(action, entityKind, templates, draft.event_key);
                  const templateOptions = templates.filter((t) => t.channel === 'email' && t.event_type === draft.event_key);

                  return (
                    <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">New notification row</div>
                        <Badge variant="outline" className="text-[10px]">{ACTION_LABELS[action]}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <div className="md:col-span-3">
                            <Label className="text-[11px]">Event key</Label>
                            <Select
                              value={draft.event_key}
                              onValueChange={(value) => updateDraftEventKey(key, draft, value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select event" />
                              </SelectTrigger>
                              <SelectContent>
                                {eventOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value} className="text-xs">
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-3">
                            <Label className="text-[11px]">Recipient type</Label>
                            <Select
                              value={draft.recipient_type}
                              onValueChange={(v) => setDraft(key, {
                                ...draft,
                                recipient_type: v as ActionNotificationRecipientType,
                                recipient_config: normalizeRecipientConfig(v as ActionNotificationRecipientType, draft.recipient_config),
                                recipient_config_text: JSON.stringify(
                                  normalizeRecipientConfig(v as ActionNotificationRecipientType, draft.recipient_config),
                                  null,
                                  2,
                                ),
                                recipient_config_error: null,
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {RECIPIENT_OPTIONS.map((r) => (
                                  <SelectItem key={r} value={r} className="text-xs">
                                    {RECIPIENT_LABELS[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-3">
                            <Label className="text-[11px]">Template</Label>
                            <Select
                              value={draft.template_id ?? 'none'}
                              onValueChange={(v) => setDraft(key, { ...draft, template_id: v === 'none' ? null : v })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick template" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-xs">— Use event default —</SelectItem>
                                {templateOptions.map((t) => (
                                  <SelectItem key={t.id} value={t.id} className="text-xs">
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-3">
                            <Label className="text-[11px]">Enabled</Label>
                            <div className="h-8 px-2 border rounded-md flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Dispatch this row</span>
                              <Switch
                                checked={draft.is_enabled}
                                onCheckedChange={(checked) => setDraft(key, { ...draft, is_enabled: checked })}
                              />
                            </div>
                          </div>

                          <div className="md:col-span-12 space-y-2">
                            <Label className="text-[11px]">Recipient details</Label>
                            {draft.recipient_type === 'role' ? (
                              <Select
                                value={roleValue || 'none'}
                                onValueChange={(v) => setDraft(key, {
                                  ...draft,
                                  recipient_config: v === 'none' ? {} : { role: v, role_name: v },
                                  recipient_config_text: JSON.stringify(v === 'none' ? {} : { role: v, role_name: v }, null, 2),
                                  recipient_config_error: null,
                                })}
                              >
                                <SelectTrigger className="h-8 text-xs max-w-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">Select role</SelectItem>
                                  {roles.map((role) => (
                                    <SelectItem key={role.id} value={role.name} className="text-xs">
                                      {role.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : draft.recipient_type === 'custom_email' ? (
                              <Input
                                className="h-8 text-xs max-w-sm"
                                type="email"
                                placeholder="name@example.com"
                                value={emailValue}
                                onChange={(e) => setDraft(key, {
                                  ...draft,
                                  recipient_config: { email: e.target.value },
                                  recipient_config_text: JSON.stringify({ email: e.target.value }, null, 2),
                                  recipient_config_error: null,
                                })}
                              />
                            ) : (
                              <Textarea
                                className="min-h-[96px] text-xs font-mono"
                                value={genericConfigValue}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  let parsedConfig = draft.recipient_config;
                                  let error: string | null = null;
                                  try {
                                    parsedConfig = next.trim() ? JSON.parse(next) : {};
                                  } catch {
                                    error = 'Recipient details must be valid JSON.';
                                  }
                                  setDraft(key, {
                                    ...draft,
                                    recipient_config_text: next,
                                    recipient_config: parsedConfig,
                                    recipient_config_error: error,
                                  });
                                }}
                              />
                            )}
                            {draft.recipient_config_error && (
                              <p className="text-[11px] text-destructive">{draft.recipient_config_error}</p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              {recipientConfigHelpText(draft.recipient_type)}
                            </p>
                          </div>

                          <div className="md:col-span-12 flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => cancelEditing(action)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={upsert.isPending || !!draft.recipient_config_error}
                              onClick={() => saveDraft(action)}
                            >
                              <Save className="h-3.5 w-3.5" /> Save
                            </Button>
                          </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
