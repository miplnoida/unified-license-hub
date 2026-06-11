/**
 * Per-action notification editor — used inside the workflow step builder.
 *
 * For each allowed_action on a step, admins can attach one or more
 * (event_key, recipient_type, template) bindings. At runtime
 * perform-workflow-action reads these from approval_action_notifications
 * and fans out one dispatch-notification-event call per enabled row.
 */
import { useMemo, useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pencil, Plus, Save, Trash2, Bell, Loader2, X } from 'lucide-react';
import {
  useActionNotifications,
  useNotificationTemplates,
  useUpsertActionNotification,
  useDeleteActionNotification,
  DEFAULT_EVENT_FOR_ACTION,
  RECIPIENT_LABELS,
  normalizeRecipientConfig,
  type ActionNotification,
  type ActionNotificationRecipientType,
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
}

const RECIPIENT_OPTIONS: ActionNotificationRecipientType[] = [
  'applicant',
  'current_approver',
  'previous_actor',
  'role',
  'admin',
  'custom_email',
];

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

function createDraft(action: WorkflowActionType, row?: ActionNotification): NotificationRowDraft {
  const recipientConfig = normalizeRecipientConfig(row?.recipient_type ?? 'applicant', row?.recipient_config ?? {});
  return {
    id: row?.id,
    action_type: action,
    event_key: row?.event_key ?? DEFAULT_EVENT_FOR_ACTION[action],
    recipient_type: row?.recipient_type ?? 'applicant',
    recipient_config: recipientConfig,
    recipient_config_text: JSON.stringify(recipientConfig, null, 2),
    recipient_config_error: null,
    template_id: row?.template_id ?? null,
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

export function ActionNotificationsEditor({ stepId, allowedActions, readOnly = false }: Props) {
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
    setDraft(key, createDraft(action, row));
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

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4" /> Action notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}
        {allowedActions.map((action) => {
          const list = grouped.get(action) ?? [];
          const isOpen = openAction === action;
          return (
            <div key={action} className="rounded border bg-background">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                onClick={() => setOpenAction(isOpen ? null : action)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ACTION_LABELS[action]}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {list.length} notification{list.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{isOpen ? 'Hide' : 'Configure'}</span>
              </button>

              {isOpen && (
                <div className="px-3 py-3 border-t space-y-3">
                  {list.length === 0 && (
                    <div className="text-xs italic text-muted-foreground">
                      No notifications configured for this action.
                    </div>
                  )}

                  {list.map((row) => (
                    (() => {
                      const key = getDraftKey(action, row.id);
                      const isEditingRow = editingRows[key] === true;
                      const draft = drafts[key] ?? createDraft(action, row);
                      const roleValue = typeof draft.recipient_config.role === 'string'
                        ? draft.recipient_config.role
                        : typeof draft.recipient_config.role_name === 'string'
                          ? draft.recipient_config.role_name
                          : 'none';
                      const emailValue = typeof draft.recipient_config.email === 'string'
                        ? draft.recipient_config.email
                        : '';
                      const genericConfigValue = draft.recipient_config_text;

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
                                <Input
                                  className="h-8 text-xs"
                                  value={draft.event_key}
                                  onChange={(e) => setDraft(key, { ...draft, event_key: e.target.value })}
                                />
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
                                    {templates.map((t) => (
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
                                      recipient_config: v === 'none' ? {} : { role: v },
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

                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => startEditing(action)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add notification
                    </Button>
                  )}

                  {!readOnly && editingRows[getDraftKey(action)] && (() => {
                    const key = getDraftKey(action);
                    const draft = drafts[key] ?? createDraft(action);
                    const roleValue = typeof draft.recipient_config.role === 'string'
                      ? draft.recipient_config.role
                      : typeof draft.recipient_config.role_name === 'string'
                        ? draft.recipient_config.role_name
                        : 'none';
                    const emailValue = typeof draft.recipient_config.email === 'string'
                      ? draft.recipient_config.email
                      : '';
                    const genericConfigValue = draft.recipient_config_text;

                    return (
                      <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">New notification row</div>
                          <Badge variant="outline" className="text-[10px]">{ACTION_LABELS[action]}</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <div className="md:col-span-3">
                            <Label className="text-[11px]">Event key</Label>
                            <Input
                              className="h-8 text-xs"
                              value={draft.event_key}
                              onChange={(e) => setDraft(key, { ...draft, event_key: e.target.value })}
                            />
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
                                {templates.map((t) => (
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
                                  recipient_config: v === 'none' ? {} : { role: v },
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
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
