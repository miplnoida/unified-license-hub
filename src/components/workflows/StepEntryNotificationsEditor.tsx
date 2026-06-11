/**
 * Step Entry Notifications editor — distinct from action notifications.
 *
 * These rows fire when a workflow advances INTO this step (i.e. the step
 * is assigned to an approver). Each row binds (event_key, recipient_type,
 * template_id) and is stored in approval_step_entry_notifications.
 *
 * The runtime dispatcher loads enabled rows in perform-workflow-action after
 * the RPC sets the new current_step_id (best-effort, never blocks).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Save, X, Trash2, Pencil, BellRing } from 'lucide-react';
import Swal from 'sweetalert2';
import {
  useNotificationTemplates,
  RECIPIENT_LABELS,
  type ActionNotificationRecipientType,
} from '@/hooks/useActionNotifications';
import {
  useStepEntryNotifications,
  useUpsertStepEntryNotification,
  useDeleteStepEntryNotification,
  type StepEntryNotification,
} from '@/hooks/useStepEntryNotifications';

const RECIPIENT_OPTIONS: ActionNotificationRecipientType[] = [
  'applicant',
  'current_approver',
  'previous_actor',
  'role',
  'admin',
  'custom_email',
];

const DEFAULT_EVENT_KEY = 'application.step_assigned';

interface Props {
  stepId: string;
}

interface Draft {
  id?: string;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_role: string;
  recipient_email: string;
  template_id: string | null;
  is_enabled: boolean;
}

const emptyDraft = (): Draft => ({
  event_key: DEFAULT_EVENT_KEY,
  recipient_type: 'current_approver',
  recipient_role: '',
  recipient_email: '',
  template_id: null,
  is_enabled: true,
});

const draftFrom = (row: StepEntryNotification): Draft => ({
  id: row.id,
  event_key: row.event_key,
  recipient_type: row.recipient_type,
  recipient_role: (row.recipient_config?.role as string) || (row.recipient_config?.role_name as string) || '',
  recipient_email: (row.recipient_config?.email as string) || '',
  template_id: row.template_id,
  is_enabled: row.is_enabled,
});

export function StepEntryNotificationsEditor({ stepId }: Props) {
  const { data: rows = [], isLoading } = useStepEntryNotifications(stepId);
  const { data: templates = [] } = useNotificationTemplates();
  const upsert = useUpsertStepEntryNotification(stepId);
  const del = useDeleteStepEntryNotification(stepId);

  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const startNew = () => { setDraft(emptyDraft()); setEditingId('new'); };
  const startEdit = (row: StepEntryNotification) => { setDraft(draftFrom(row)); setEditingId(row.id); };
  const cancel = () => { setEditingId(null); setDraft(emptyDraft()); };

  const save = async () => {
    const recipient_config: Record<string, unknown> = {};
    if (draft.recipient_type === 'role' && draft.recipient_role) {
      recipient_config.role = draft.recipient_role;
      recipient_config.role_name = draft.recipient_role;
    }
    if (draft.recipient_type === 'custom_email' && draft.recipient_email) {
      recipient_config.email = draft.recipient_email;
    }
    try {
      await upsert.mutateAsync({
        id: draft.id,
        event_key: draft.event_key,
        recipient_type: draft.recipient_type,
        recipient_config,
        template_id: draft.template_id,
        is_enabled: draft.is_enabled,
      });
      cancel();
    } catch {/* hook toasts */}
  };

  const confirmDelete = async (row: StepEntryNotification) => {
    const res = await Swal.fire({
      title: 'Delete notification?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc2626',
    });
    if (res.isConfirmed) await del.mutateAsync(row.id);
  };

  const toggleEnabled = async (row: StepEntryNotification, next: boolean) => {
    await upsert.mutateAsync({
      id: row.id,
      event_key: row.event_key,
      recipient_type: row.recipient_type,
      recipient_config: row.recipient_config,
      template_id: row.template_id,
      is_enabled: next,
    });
  };

  return (
    <div className="space-y-2" data-testid={`step-entry-notifications-${stepId}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <BellRing className="h-3.5 w-3.5" /> Step Entry Notifications
        </Label>
        <Button type="button" size="sm" variant="outline" onClick={startNew} disabled={editingId === 'new'}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 && editingId !== 'new' ? (
        <p className="text-xs text-muted-foreground italic">
          No step-entry notifications. Add one to notify recipients when this step is assigned.
        </p>
      ) : null}

      <div className="space-y-1.5">
        {rows.map(row => (
          <Card key={row.id} className="p-2">
            {editingId === row.id ? (
              <NotificationForm
                draft={draft}
                setDraft={setDraft}
                templates={templates}
                onSave={save}
                onCancel={cancel}
                saving={upsert.isPending}
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant={row.is_enabled ? 'default' : 'outline'}>{row.event_key}</Badge>
                <Badge variant="secondary" className="text-[10px]">
                  → {RECIPIENT_LABELS[row.recipient_type] || row.recipient_type}
                </Badge>
                {row.template_id && (
                  <Badge variant="outline" className="text-[10px]">
                    {templates.find(t => t.id === row.template_id)?.name || 'template'}
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Checkbox
                      checked={row.is_enabled}
                      onCheckedChange={v => toggleEnabled(row, !!v)}
                      aria-label="Enabled"
                    />
                    On
                  </label>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(row)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => confirmDelete(row)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {editingId === 'new' && (
          <Card className="p-2 border-primary/40">
            <NotificationForm
              draft={draft}
              setDraft={setDraft}
              templates={templates}
              onSave={save}
              onCancel={cancel}
              saving={upsert.isPending}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function NotificationForm({
  draft, setDraft, templates, onSave, onCancel, saving,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  templates: Array<{ id: string; name: string }>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Event Key</Label>
          <Input
            value={draft.event_key}
            onChange={e => setDraft({ ...draft, event_key: e.target.value })}
            placeholder={DEFAULT_EVENT_KEY}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Recipient</Label>
          <Select
            value={draft.recipient_type}
            onValueChange={v => setDraft({ ...draft, recipient_type: v as ActionNotificationRecipientType })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECIPIENT_OPTIONS.map(r => (
                <SelectItem key={r} value={r} className="text-xs">{RECIPIENT_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {draft.recipient_type === 'role' && (
        <Input
          value={draft.recipient_role}
          onChange={e => setDraft({ ...draft, recipient_role: e.target.value })}
          placeholder="Role name (e.g. admin)"
          className="h-7 text-xs"
        />
      )}
      {draft.recipient_type === 'custom_email' && (
        <Input
          type="email"
          value={draft.recipient_email}
          onChange={e => setDraft({ ...draft, recipient_email: e.target.value })}
          placeholder="recipient@example.com"
          className="h-7 text-xs"
        />
      )}

      <div>
        <Label className="text-[10px] text-muted-foreground">Notification Template</Label>
        <Select
          value={draft.template_id ?? 'none'}
          onValueChange={v => setDraft({ ...draft, template_id: v === 'none' ? null : v })}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Choose template" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">— use default —</SelectItem>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="h-3 w-3 mr-1" /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
