/**
 * Editor for per-action configuration on an approval step.
 *
 * Each action card binds to a row in approval_step_actions:
 *   - action type (only runtime-supported types are selectable)
 *   - display label
 *   - mandatory comments toggle (server-enforced)
 *   - optional result status override
 *   - next-step routing (next / specific / previous / return / end / keep)
 *   - end state (when next_step_mode = end_workflow)
 *   - embedded ActionNotificationsEditor scoped to (step, action_type)
 *
 * "Schedule Meeting", "Review", and "Review for Previous Reviewer" from the
 * reference screenshots are intentionally NOT listed: the runtime function
 * `perform_workflow_transition` does not yet accept them. Listing them would
 * give admins a UI option that fails at execute time, which the spec
 * explicitly forbids ("Do not show action types that cannot be executed by
 * runtime").
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Save, X, Pencil } from 'lucide-react';
import Swal from 'sweetalert2';
import { ACTION_LABELS, type WorkflowActionType, type WorkflowStep } from '@/hooks/useWorkflowEngine';
import {
  useStepActions,
  useUpsertStepAction,
  useDeleteStepAction,
  SUPPORTED_ACTION_TYPES,
  NEXT_STEP_MODE_LABELS,
  END_STATE_LABELS,
  type StepAction,
  type StepActionInput,
  type NextStepMode,
  type EndState,
} from '@/hooks/useStepActions';
import { ActionNotificationsEditor } from '@/components/workflows/ActionNotificationsEditor';

interface Props {
  step: WorkflowStep;
  /** Sibling steps in the same workflow (for the "Specific Step" target picker). */
  siblingSteps: WorkflowStep[];
}

interface DraftState {
  id?: string;
  action_type: WorkflowActionType;
  label: string;
  require_comments: boolean;
  result_status_override: string;
  next_step_mode: NextStepMode;
  next_step_id: string | null;
  end_state: EndState | null;
  is_enabled: boolean;
}

function emptyDraft(): DraftState {
  return {
    action_type: 'approve',
    label: '',
    require_comments: true,
    result_status_override: '',
    next_step_mode: 'next',
    next_step_id: null,
    end_state: null,
    is_enabled: true,
  };
}

function draftFrom(row: StepAction): DraftState {
  return {
    id: row.id,
    action_type: row.action_type,
    label: row.label || '',
    require_comments: !!row.require_comments,
    result_status_override: row.result_status_override || '',
    next_step_mode: row.next_step_mode,
    next_step_id: row.next_step_id,
    end_state: row.end_state,
    is_enabled: !!row.is_enabled,
  };
}

export function StepActionsEditor({ step, siblingSteps }: Props) {
  const { data: actions = [], isLoading } = useStepActions(step.id);
  const upsert = useUpsertStepAction(step.id);
  const del = useDeleteStepAction(step.id);

  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  const usedTypes = useMemo(() => new Set(actions.map(a => a.action_type)), [actions]);

  const targetStepOptions = useMemo(
    () => siblingSteps.filter(s => s.id !== step.id).sort((a, b) => a.step_order - b.step_order),
    [siblingSteps, step.id],
  );

  const startNew = () => {
    setDraft(emptyDraft());
    setEditingId('new');
  };
  const startEdit = (row: StepAction) => {
    setDraft(draftFrom(row));
    setEditingId(row.id);
  };
  const cancel = () => { setEditingId(null); setDraft(emptyDraft()); };

  const save = async () => {
    const payload: StepActionInput = {
      id: draft.id,
      action_type: draft.action_type,
      label: draft.label.trim() || ACTION_LABELS[draft.action_type],
      require_comments: draft.require_comments,
      result_status_override: draft.result_status_override.trim() || null,
      next_step_mode: draft.next_step_mode,
      next_step_id: draft.next_step_mode === 'specific_step' ? draft.next_step_id : null,
      end_state: draft.next_step_mode === 'end_workflow' ? draft.end_state : null,
      sort_order: actions.length,
      is_enabled: draft.is_enabled,
    };
    try {
      await upsert.mutateAsync(payload);
      cancel();
    } catch {
      /* toast handled in hook */
    }
  };

  const confirmDelete = async (row: StepAction) => {
    const res = await Swal.fire({
      title: 'Delete this action?',
      text: `"${row.label || row.action_type}" will be removed from this step.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc2626',
    });
    if (res.isConfirmed) {
      await del.mutateAsync(row.id);
    }
  };

  const toggleEnabled = async (row: StepAction, next: boolean) => {
    await upsert.mutateAsync({
      id: row.id,
      action_type: row.action_type,
      label: row.label,
      require_comments: row.require_comments,
      result_status_override: row.result_status_override,
      next_step_mode: row.next_step_mode,
      next_step_id: row.next_step_id,
      end_state: row.end_state,
      sort_order: row.sort_order,
      is_enabled: next,
    });
  };

  return (
    <div className="space-y-3" data-testid={`step-actions-${step.id}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step Actions
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={startNew}
          disabled={editingId === 'new'}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Action
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading actions…</p>
      ) : actions.length === 0 && editingId !== 'new' ? (
        <p className="text-xs text-muted-foreground italic">
          No actions configured. Add at least one so approvers can act.
        </p>
      ) : null}

      <div className="space-y-2">
        {actions.map(row => {
          const isEditingThis = editingId === row.id;
          return (
            <Card key={row.id} className="p-3 space-y-2">
              {isEditingThis ? (
                <ActionForm
                  draft={draft}
                  setDraft={setDraft}
                  usedTypes={usedTypes}
                  editingId={row.id}
                  targetStepOptions={targetStepOptions}
                  onSave={save}
                  onCancel={cancel}
                  saving={upsert.isPending}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={row.is_enabled ? 'default' : 'outline'}>
                      {row.label || ACTION_LABELS[row.action_type] || row.action_type}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {ACTION_LABELS[row.action_type] || row.action_type}
                    </Badge>
                    {row.require_comments && (
                      <Badge variant="outline" className="text-[10px]">Comments required</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      → {NEXT_STEP_MODE_LABELS[row.next_step_mode]}
                      {row.next_step_mode === 'end_workflow' && row.end_state && ` · ${END_STATE_LABELS[row.end_state]}`}
                      {row.next_step_mode === 'specific_step' && row.next_step_id && (
                        ` · ${targetStepOptions.find(s => s.id === row.next_step_id)?.name || '?'}`
                      )}
                    </Badge>
                    {row.result_status_override && (
                      <Badge variant="outline" className="text-[10px]">
                        Status → {row.result_status_override}
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Checkbox
                          checked={row.is_enabled}
                          onCheckedChange={v => toggleEnabled(row, !!v)}
                          aria-label="Enabled"
                        />
                        Enabled
                      </label>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => confirmDelete(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/30 p-2">
                    <ActionNotificationsEditor
                      stepId={step.id}
                      allowedActions={[row.action_type]}
                    />
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {editingId === 'new' && (
          <Card className="p-3 border-primary/40">
            <ActionForm
              draft={draft}
              setDraft={setDraft}
              usedTypes={usedTypes}
              editingId={null}
              targetStepOptions={targetStepOptions}
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

function ActionForm({
  draft, setDraft, usedTypes, editingId, targetStepOptions, onSave, onCancel, saving,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  usedTypes: Set<string>;
  editingId: string | null;
  targetStepOptions: WorkflowStep[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const typeOptions = SUPPORTED_ACTION_TYPES.filter(t =>
    t === draft.action_type || !usedTypes.has(t) || editingId !== null,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Action Type</Label>
          <Select
            value={draft.action_type}
            onValueChange={v => setDraft({ ...draft, action_type: v as WorkflowActionType })}
            disabled={!!editingId}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {typeOptions.map(t => (
                <SelectItem key={t} value={t} className="text-xs">
                  {ACTION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Action Name</Label>
          <Input
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            placeholder={ACTION_LABELS[draft.action_type]}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`req-comments-${editingId ?? 'new'}`}
          checked={draft.require_comments}
          onCheckedChange={v => setDraft({ ...draft, require_comments: !!v })}
        />
        <Label htmlFor={`req-comments-${editingId ?? 'new'}`} className="text-xs cursor-pointer">
          Reviewer must enter remarks
        </Label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">What happens next?</Label>
          <Select
            value={draft.next_step_mode}
            onValueChange={v => setDraft({ ...draft, next_step_mode: v as NextStepMode })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(NEXT_STEP_MODE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {draft.next_step_mode === 'specific_step' && (
          <div>
            <Label className="text-xs text-muted-foreground">Target Step</Label>
            <Select
              value={draft.next_step_id ?? 'none'}
              onValueChange={v => setDraft({ ...draft, next_step_id: v === 'none' ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose a step" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">— select —</SelectItem>
                {targetStepOptions.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.step_order}. {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {draft.next_step_mode === 'end_workflow' && (
          <div>
            <Label className="text-xs text-muted-foreground">End State</Label>
            <Select
              value={draft.end_state ?? 'none'}
              onValueChange={v => setDraft({ ...draft, end_state: v === 'none' ? null : (v as EndState) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose end state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">— select —</SelectItem>
                {Object.entries(END_STATE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Result Status Override (optional)</Label>
        <Input
          value={draft.result_status_override}
          onChange={e => setDraft({ ...draft, result_status_override: e.target.value })}
          placeholder="e.g. under_review (leave blank to use default)"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving…' : 'Save Action'}
        </Button>
      </div>
    </div>
  );
}
