/**
 * Editor for per-action configuration on an approval step.
 *
 * Each action card binds to a row in approval_step_actions.
 * The UI restricts new action selection to Approve / Reject / Send Back
 * (per product requirement). Legacy rows with other action_types continue
 * to load and execute at runtime — they just display a "legacy" badge and
 * cannot be re-typed.
 *
 * Duplicate action_types within the same step are prevented:
 *  - other rows' action_types are filtered out of the picker
 *  - save is rejected by the unique (step_id, action_type) constraint
 */
import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Trash2, Save, X, Pencil, Upload, Download, ImageIcon,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import { ACTION_LABELS, type WorkflowActionType, type WorkflowStep } from '@/hooks/useWorkflowEngine';
import {
  useStepActions,
  useUpsertStepAction,
  useDeleteStepAction,
  ALLOWED_UI_ACTION_TYPES,
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
  siblingSteps: WorkflowStep[];
  /** Workflow entity_type — forwarded to ActionNotificationsEditor so default event_keys are entity-aware. */
  entityType?: string;
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
  require_digital_signature: boolean;
  signature_data_url: string | null;
}

const ALLOWED_SIGNATURE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
const MAX_SIGNATURE_BYTES = 512 * 1024; // 512KB — kept small because we store as data URL

function emptyDraft(defaultType: WorkflowActionType = 'approve'): DraftState {
  return {
    action_type: defaultType,
    label: '',
    require_comments: true,
    result_status_override: '',
    next_step_mode: 'next',
    next_step_id: null,
    end_state: null,
    is_enabled: true,
    require_digital_signature: false,
    signature_data_url: null,
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
    require_digital_signature: !!row.require_digital_signature,
    signature_data_url: row.signature_data_url ?? null,
  };
}

export function StepActionsEditor({ step, siblingSteps, entityType }: Props) {
  const { data: actions = [], isLoading } = useStepActions(step.id);
  const upsert = useUpsertStepAction(step.id, entityType);
  const del = useDeleteStepAction(step.id);

  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  // Map of action_type -> row currently using it
  const typeUsage = useMemo(() => {
    const m = new Map<string, StepAction>();
    for (const a of actions) m.set(a.action_type, a);
    return m;
  }, [actions]);

  const targetStepOptions = useMemo(
    () => siblingSteps.filter(s => s.id !== step.id).sort((a, b) => a.step_order - b.step_order),
    [siblingSteps, step.id],
  );

  const firstAvailableType = useMemo<WorkflowActionType | null>(() => {
    return ALLOWED_UI_ACTION_TYPES.find(t => !typeUsage.has(t)) ?? null;
  }, [typeUsage]);

  const startNew = () => {
    if (!firstAvailableType) {
      toast.error('All allowed action types are already added to this step.');
      return;
    }
    setDraft(emptyDraft(firstAvailableType));
    setEditingId('new');
  };
  const startEdit = (row: StepAction) => {
    setDraft(draftFrom(row));
    setEditingId(row.id);
  };
  const cancel = () => { setEditingId(null); setDraft(emptyDraft()); };

  const save = async () => {
    // Duplicate guard (UI level). Server has unique(step_id, action_type) too.
    const existing = typeUsage.get(draft.action_type);
    if (existing && existing.id !== draft.id) {
      toast.error(`This step already has a "${ACTION_LABELS[draft.action_type]}" action.`);
      return;
    }
    if (draft.require_digital_signature && !draft.signature_data_url) {
      toast.error('Upload a signature image or turn Digital Signature off.');
      return;
    }
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
      require_digital_signature: draft.require_digital_signature,
      signature_data_url: draft.require_digital_signature ? draft.signature_data_url : null,
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
      require_digital_signature: row.require_digital_signature,
      signature_data_url: row.signature_data_url,
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
          disabled={editingId === 'new' || !firstAvailableType}
          title={!firstAvailableType ? 'All allowed action types are already added' : undefined}
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
          const isLegacy = !ALLOWED_UI_ACTION_TYPES.includes(row.action_type);
          return (
            <Card key={row.id} className="p-3 space-y-2">
              {isEditingThis ? (
                <ActionForm
                  draft={draft}
                  setDraft={setDraft}
                  typeUsage={typeUsage}
                  editingId={row.id}
                  targetStepOptions={targetStepOptions}
                  onSave={save}
                  onCancel={cancel}
                  saving={upsert.isPending}
                  stepRequiresSignature={!!step.require_digital_signature}
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
                    {isLegacy && (
                      <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                        Legacy / unsupported
                      </Badge>
                    )}
                    {row.require_comments && (
                      <Badge variant="outline" className="text-[10px]">Comments required</Badge>
                    )}
                    {(row.require_digital_signature || step.require_digital_signature) && (
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        title={step.require_digital_signature ? 'Required at step level' : 'Required for this action'}
                      >
                        Digital signature
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      → {NEXT_STEP_MODE_LABELS[row.next_step_mode] || row.next_step_mode || 'Unknown'}
                      {row.next_step_mode === 'end_workflow' && row.end_state && ` · ${END_STATE_LABELS[row.end_state] || row.end_state}`}
                      {row.next_step_mode === 'specific_step' && row.next_step_id && (
                        ` · ${targetStepOptions.find(s => s.id === row.next_step_id)?.name || '?'}`
                      )}
                    </Badge>
                    {row.result_status_override && (
                      <Badge variant="outline" className="text-[10px]">
                        Status → {row.result_status_override}
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <label
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"
                        title="When enabled, reviewers can use this action at this step. When disabled, the action is hidden during review."
                      >
                        <Switch
                          checked={row.is_enabled}
                          onCheckedChange={v => toggleEnabled(row, !!v)}
                          aria-label="Available to reviewer"
                        />
                        <span>Available to reviewer</span>
                      </label>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => startEdit(row)}
                        disabled={isLegacy}
                        title={isLegacy ? 'Legacy action — delete and recreate with an allowed type to edit' : 'Edit action'}
                      >
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
                      entityType={entityType}
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
              typeUsage={typeUsage}
              editingId={null}
              targetStepOptions={targetStepOptions}
              onSave={save}
              onCancel={cancel}
              saving={upsert.isPending}
              stepRequiresSignature={!!step.require_digital_signature}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function ActionForm({
  draft, setDraft, typeUsage, editingId, targetStepOptions, onSave, onCancel, saving, stepRequiresSignature,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  typeUsage: Map<string, StepAction>;
  editingId: string | null;
  targetStepOptions: WorkflowStep[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  stepRequiresSignature?: boolean;
}) {
  // For new rows: hide all already-used types. For existing rows: hide types
  // used by OTHER rows but keep the row's own current type selectable.
  const typeOptions = ALLOWED_UI_ACTION_TYPES.filter(t => {
    const used = typeUsage.get(t);
    if (!used) return true;
    return editingId !== null && used.id === editingId;
  });

  // Existing draft is legacy if its action_type is not in the allowed UI set.
  const isLegacyDraft = !!editingId && !ALLOWED_UI_ACTION_TYPES.includes(draft.action_type);

  // Defensive: if the saved next_step_id references a step that no longer
  // exists in this workflow, fall back to 'none' for the Select value.
  const validNextStepId =
    draft.next_step_id && targetStepOptions.some(s => s.id === draft.next_step_id)
      ? draft.next_step_id
      : null;

  const handleModeChange = (next: NextStepMode) => {
    // Reset stale fields so we never leave the draft in an inconsistent state.
    setDraft({
      ...draft,
      next_step_mode: next,
      next_step_id: next === 'specific_step' ? validNextStepId : null,
      end_state: next === 'end_workflow' ? draft.end_state : null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Action Type</Label>
          <Select
            value={draft.action_type}
            onValueChange={v => setDraft({ ...draft, action_type: v as WorkflowActionType })}
            disabled={isLegacyDraft}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* Keep the current legacy type visible so the Select doesn't render empty */}
              {isLegacyDraft && (
                <SelectItem value={draft.action_type} className="text-xs" disabled>
                  {ACTION_LABELS[draft.action_type] || draft.action_type} (legacy)
                </SelectItem>
              )}
              {typeOptions.map(t => (
                <SelectItem key={t} value={t} className="text-xs">
                  {ACTION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLegacyDraft && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Legacy action type cannot be changed. Delete and recreate with a supported action type.
            </p>
          )}
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

      {/* Digital Signature Required */}
      <DigitalSignatureBlock draft={draft} setDraft={setDraft} keySuffix={editingId ?? 'new'} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">What happens next?</Label>
          <Select
            value={draft.next_step_mode}
            onValueChange={v => handleModeChange(v as NextStepMode)}
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
              value={validNextStepId ?? 'none'}
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
            {targetStepOptions.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Add another step to this workflow to route here.
              </p>
            )}
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

function DigitalSignatureBlock({
  draft, setDraft, keySuffix,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  keySuffix: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!ALLOWED_SIGNATURE_MIME.includes(file.type)) {
      toast.error('Unsupported file type. Use PNG, JPG, or SVG.');
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      toast.error(`Signature must be under ${Math.round(MAX_SIGNATURE_BYTES / 1024)} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) {
        toast.error('Failed to read signature file.');
        return;
      }
      setDraft({ ...draft, signature_data_url: result });
    };
    reader.onerror = () => toast.error('Failed to read signature file.');
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (!draft.signature_data_url) return;
    const a = document.createElement('a');
    a.href = draft.signature_data_url;
    const ext = draft.signature_data_url.includes('image/svg') ? 'svg'
      : draft.signature_data_url.includes('image/png') ? 'png' : 'jpg';
    a.download = `signature.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRemove = () => {
    setDraft({ ...draft, signature_data_url: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <Switch
          id={`digital-sig-${keySuffix}`}
          checked={draft.require_digital_signature}
          onCheckedChange={v => setDraft({
            ...draft,
            require_digital_signature: !!v,
            // Clear signature if disabled — explicit OFF should not retain a stored value
            signature_data_url: v ? draft.signature_data_url : null,
          })}
        />
        <Label htmlFor={`digital-sig-${keySuffix}`} className="text-xs cursor-pointer font-medium">
          Digital Signature Required
        </Label>
      </div>

      {draft.require_digital_signature && (
        <div className="space-y-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            aria-label="Upload signature image"
          />

          {draft.signature_data_url ? (
            <div className="flex items-start gap-3">
              <div className="rounded border bg-background p-2 shrink-0">
                <img
                  src={draft.signature_data_url}
                  alt="Signature preview"
                  className="h-16 w-32 object-contain"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" /> Replace
                </Button>
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs"
                  onClick={handleDownload}
                >
                  <Download className="h-3 w-3 mr-1" /> Download
                </Button>
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive"
                  onClick={handleRemove}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" /> Upload Signature
              </Button>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> PNG, JPG, SVG · max 512 KB
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
