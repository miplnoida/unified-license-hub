import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRfiAutoSuggestions } from '@/hooks/useRfiAutoSuggestions';
import { logAction } from '@/hooks/useAuditLog';
import { applicationRfiRaise } from '@/lib/applicationLifecycleGovernedOps';

interface DraftItem {
  key: string;
  prompt: string;
  question_type: 'text' | 'document' | 'both';
  required: boolean;
  item_due_at: string;
}

export interface RfiInitialItem {
  prompt: string;
  question_type?: 'text' | 'document' | 'both';
  required?: boolean;
  item_due_at?: string;
  source_rule_id?: string;
}

interface RaiseRfiDialogProps {
  applicationId: string;
  raisedBy: string;
  approvalStepActionId?: string | null;
  workflowTypeKey?: string | null;
  sectorId?: string | null;
  formData?: unknown;
  onCreated?: () => void;
  triggerLabel?: string;
  /** Controlled open (hides the built-in trigger button). */
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Prefill items — used by sufficiency-driven auto-RFI creation. */
  initialItems?: RfiInitialItem[];
  /** Optional link to a sufficiency evaluation whose failed rules seeded the items. */
  sufficiencyEvaluationId?: string | null;
  sufficiencyResultIds?: string[];
  /** Hide the built-in trigger button (implies controlled mode). */
  hideTrigger?: boolean;
}

const emptyItem = (): DraftItem => ({
  key: Math.random().toString(36).slice(2, 9),
  prompt: '',
  question_type: 'text',
  required: true,
  item_due_at: '',
});

const fromInitial = (i: RfiInitialItem): DraftItem => ({
  key: Math.random().toString(36).slice(2, 9),
  prompt: i.prompt,
  question_type: i.question_type ?? 'text',
  required: i.required ?? true,
  item_due_at: i.item_due_at ?? '',
});

/**
 * Phase 2.1a — Reviewer dialog to raise an RFI on an application.
 * Optionally pauses the SLA on a linked approval_step_action.
 */
export function RaiseRfiDialog({
  applicationId,
  raisedBy,
  approvalStepActionId,
  workflowTypeKey,
  sectorId,
  formData,
  onCreated,
  triggerLabel = 'Raise RFI',
  open: controlledOpen,
  onOpenChange,
  initialItems,
  sufficiencyEvaluationId,
  sufficiencyResultIds,
  hideTrigger,
}: RaiseRfiDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [pauseSla, setPauseSla] = useState(true);
  const [items, setItems] = useState<DraftItem[]>(
    initialItems && initialItems.length ? initialItems.map(fromInitial) : [emptyItem()],
  );
  const [saving, setSaving] = useState(false);
  const [loadedRuleIds, setLoadedRuleIds] = useState<Set<string>>(new Set());

  const { data: suggestions = [], isLoading: loadingSuggestions } = useRfiAutoSuggestions({
    applicationId: open ? applicationId : null,
    workflowTypeKey,
    sectorId,
    formData,
  });

  const applySuggestion = (s: (typeof suggestions)[number]) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (s.default_due_days || 7));
    setItems((prev) => {
      // If the only item is empty, replace it; otherwise append.
      const draft: DraftItem = {
        key: Math.random().toString(36).slice(2, 9),
        prompt: s.prompt,
        question_type: s.question_type,
        required: s.required,
        item_due_at: dueDate.toISOString().slice(0, 10),
      };
      if (prev.length === 1 && !prev[0].prompt.trim()) return [draft];
      return [...prev, draft];
    });
    setLoadedRuleIds((prev) => new Set(prev).add(s.ruleId));
  };

  const applyAllSuggestions = () => {
    suggestions.forEach((s) => {
      if (!loadedRuleIds.has(s.ruleId)) applySuggestion(s);
    });
  };


  const reset = () => {
    setSummary('');
    setDueAt('');
    setPauseSla(true);
    setItems(initialItems && initialItems.length ? initialItems.map(fromInitial) : [emptyItem()]);
    setLoadedRuleIds(new Set());
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((i) => i.key !== key)));
  const patchItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const canSave =
    !saving &&
    items.length > 0 &&
    items.every((i) => i.prompt.trim().length > 0);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
      // Governed: the server records who raised the request, creates the items
      // and pauses the linked review clock in a single audited operation.
      const rfi = await applicationRfiRaise({
        application_id: applicationId,
        summary: summary.trim() || null,
        due_at: dueAtIso,
        approval_step_action_id: approvalStepActionId || null,
        sufficiency_evaluation_id: sufficiencyEvaluationId ?? null,
        pause_sla: pauseSla,
        items: items.map((it) => ({
          prompt: it.prompt.trim(),
          question_type: it.question_type,
          required: it.required,
          item_due_at: it.item_due_at ? new Date(it.item_due_at).toISOString() : null,
        })),
      });

      const rfiId = (rfi as any).id;


      // Audit log for unified timeline
      await logAction(
        sufficiencyEvaluationId ? 'application.rfi_raised_from_sufficiency' : 'application.rfi_raised',
        'application',
        applicationId,
        {
          after: {
            rfi_id: rfiId,
            item_count: items.length,
            due_at: dueAtIso,
            sla_paused: pauseSla && !!approvalStepActionId,
            auto_rules_used: Array.from(loadedRuleIds),
            sufficiency_evaluation_id: sufficiencyEvaluationId ?? null,
            sufficiency_result_ids: sufficiencyResultIds ?? [],
          },
        },
      );

      // Notify the applicant (fire-and-forget — never block reviewer flow)
      try {
        const { data: appRow } = await supabase
          .from('applications')
          .select('application_number, applicant_id')
          .eq('id', applicationId)
          .maybeSingle();
        const applicantId = (appRow as any)?.applicant_id ?? null;
        const appNumber = (appRow as any)?.application_number ?? null;
        const deepLink = `/applications/${applicationId}?tab=rfi`;

        // Guaranteed in-app row so the applicant dashboard + header bell surface it
        // immediately, even if no notification_event_config exists for this key.
        if (applicantId) {
          await (supabase as any).rpc('workflow_notification_emit', {
            _entity_type: 'application',
            _entity_id: applicationId,
            _title: 'Information requested on your application',
            _message: `${items.length} question${items.length === 1 ? '' : 's'} raised${appNumber ? ` on ${appNumber}` : ''}${dueAtIso ? ` — due ${new Date(dueAtIso).toLocaleDateString()}` : ''}.${summary.trim() ? ` ${summary.trim()}` : ''}`,
            _type: 'rfi',
            _route: deepLink,
          });
        }

        // Templated fan-out (email + any configured channels)
      } catch {
        // swallow — notification failure must not block RFI creation
      }


      toast.success(`RFI raised with ${items.length} question${items.length === 1 ? '' : 's'}`);
      setOpen(false);
      reset();
      onCreated?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to raise RFI');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!hideTrigger && controlledOpen === undefined && (
        <Button variant="default" size="sm" onClick={() => setOpen(true)}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request additional information</DialogTitle>
            <DialogDescription>
              List each item the applicant must supply. The applicant is notified and, if enabled,
              the review SLA pauses until they respond.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Summary (optional)</Label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief context shown to the applicant"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Overall due date</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
              {approvalStepActionId && (
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={pauseSla} onCheckedChange={(c) => setPauseSla(!!c)} />
                    Pause review SLA while RFI is open
                  </label>
                </div>
              )}
            </div>

            {suggestions.length > 0 && (
              <Card className="p-3 border-primary/40 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Suggested items ({suggestions.length})
                  </div>
                  <Button data-rbac="application_management.edit"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyAllSuggestions}
                    disabled={suggestions.every((s) => loadedRuleIds.has(s.ruleId))}
                  >
                    Add all
                  </Button>
                </div>
                <ul className="space-y-1">
                  {suggestions.map((s) => {
                    const loaded = loadedRuleIds.has(s.ruleId);
                    return (
                      <li
                        key={s.ruleId}
                        className="flex items-start gap-2 justify-between text-xs bg-background rounded px-2 py-1.5"
                      >
                        <div className="flex-1">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-muted-foreground line-clamp-2">{s.prompt}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={loaded ? 'ghost' : 'secondary'}
                          onClick={() => applySuggestion(s)}
                          disabled={loaded}
                        >
                          {loaded ? 'Added' : 'Add'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
            {loadingSuggestions && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking auto-rules…
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items ({items.length})</Label>
                <Button data-rbac="application_management.edit" type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-3 w-3" /> Add item
                </Button>
              </div>
              {items.map((it, idx) => (
                <Card key={it.key} className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Item {idx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(it.key)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={it.prompt}
                    onChange={(e) => patchItem(it.key, { prompt: e.target.value })}
                    placeholder="What information do you need from the applicant?"
                    rows={2}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Response type</Label>
                      <Select
                        value={it.question_type}
                        onValueChange={(v: any) => patchItem(it.key, { question_type: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="document">Document</SelectItem>
                          <SelectItem value="both">Text + Document</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Item due date</Label>
                      <Input
                        type="date"
                        value={it.item_due_at}
                        onChange={(e) => patchItem(it.key, { item_due_at: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={it.required}
                          onCheckedChange={(c) => patchItem(it.key, { required: !!c })}
                        />
                        Required
                      </label>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button data-rbac="application_management.edit" onClick={submit} disabled={!canSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Raise RFI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
