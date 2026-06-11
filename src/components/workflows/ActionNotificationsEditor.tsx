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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Bell, Loader2 } from 'lucide-react';
import {
  useActionNotifications,
  useNotificationTemplates,
  useUpsertActionNotification,
  useDeleteActionNotification,
  DEFAULT_EVENT_FOR_ACTION,
  RECIPIENT_LABELS,
  type ActionNotificationRecipientType,
} from '@/hooks/useActionNotifications';
import {
  ACTION_LABELS,
  type WorkflowActionType,
} from '@/hooks/useWorkflowEngine';

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

export function ActionNotificationsEditor({ stepId, allowedActions, readOnly = false }: Props) {
  const { data: rows = [], isLoading } = useActionNotifications(stepId);
  const { data: templates = [] } = useNotificationTemplates();
  const upsert = useUpsertActionNotification(stepId);
  const del = useDeleteActionNotification(stepId);
  const [openAction, setOpenAction] = useState<WorkflowActionType | null>(null);

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
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-4">
                        <Label className="text-[11px]">Event key</Label>
                        <Input
                          className="h-8 text-xs"
                          defaultValue={row.event_key}
                          disabled={readOnly}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== row.event_key) {
                              upsert.mutate({ ...row, event_key: v });
                            }
                          }}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-[11px]">Recipient</Label>
                        <Select
                          value={row.recipient_type}
                          disabled={readOnly}
                          onValueChange={(v) =>
                            upsert.mutate({ ...row, recipient_type: v as ActionNotificationRecipientType })
                          }
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
                          value={row.template_id ?? 'none'}
                          disabled={readOnly}
                          onValueChange={(v) =>
                            upsert.mutate({ ...row, template_id: v === 'none' ? null : v })
                          }
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
                      <div className="md:col-span-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.is_enabled}
                            disabled={readOnly}
                            onCheckedChange={(checked) =>
                              upsert.mutate({ ...row, is_enabled: checked })
                            }
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {row.is_enabled ? 'On' : 'Off'}
                          </span>
                        </div>
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => del.mutate(row.id)}
                            aria-label="Delete notification"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() =>
                        upsert.mutate({
                          action_type: action,
                          event_key: DEFAULT_EVENT_FOR_ACTION[action],
                          recipient_type: 'applicant',
                          template_id: null,
                          is_enabled: true,
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add notification
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
