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

interface DraftItem {
  key: string;
  prompt: string;
  question_type: 'text' | 'document' | 'both';
  required: boolean;
  item_due_at: string;
}

interface RaiseRfiDialogProps {
  applicationId: string;
  raisedBy: string;
  approvalStepActionId?: string | null;
  onCreated?: () => void;
  triggerLabel?: string;
}

const emptyItem = (): DraftItem => ({
  key: Math.random().toString(36).slice(2, 9),
  prompt: '',
  question_type: 'text',
  required: true,
  item_due_at: '',
});

/**
 * Phase 2.1a — Reviewer dialog to raise an RFI on an application.
 * Optionally pauses the SLA on a linked approval_step_action.
 */
export function RaiseRfiDialog({
  applicationId,
  raisedBy,
  approvalStepActionId,
  onCreated,
  triggerLabel = 'Raise RFI',
}: RaiseRfiDialogProps) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [pauseSla, setPauseSla] = useState(true);
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSummary('');
    setDueAt('');
    setPauseSla(true);
    setItems([emptyItem()]);
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
      const { data: rfi, error: rfiErr } = await supabase
        .from('application_rfis' as any)
        .insert({
          application_id: applicationId,
          raised_by: raisedBy,
          due_at: dueAtIso,
          summary: summary.trim() || null,
          approval_step_action_id: approvalStepActionId || null,
          status: 'open',
        })
        .select('id')
        .single();
      if (rfiErr) throw rfiErr;

      const rfiId = (rfi as any).id;
      const payload = items.map((it, idx) => ({
        rfi_id: rfiId,
        ordinal: idx,
        prompt: it.prompt.trim(),
        question_type: it.question_type,
        required: it.required,
        item_due_at: it.item_due_at ? new Date(it.item_due_at).toISOString() : null,
        response_status: 'pending',
      }));
      const { error: itErr } = await supabase.from('application_rfi_items' as any).insert(payload);
      if (itErr) throw itErr;

      // Pause SLA on the linked approval step action (Phase 1 primitive)
      if (pauseSla && approvalStepActionId) {
        await supabase
          .from('approval_step_actions' as any)
          .update({
            paused_at: new Date().toISOString(),
            paused_reason: `RFI raised: ${summary.trim() || 'awaiting applicant response'}`,
            resumed_at: null,
          })
          .eq('id', approvalStepActionId);
      }

      // Audit log for unified timeline
      await supabase.from('audit_logs' as any).insert({
        user_id: raisedBy,
        action: 'application.rfi_raised',
        table_name: 'applications',
        record_id: applicationId,
        new_values: {
          rfi_id: rfiId,
          item_count: items.length,
          due_at: dueAtIso,
          sla_paused: pauseSla && !!approvalStepActionId,
        },
      });

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
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="mr-2 h-4 w-4" />
        {triggerLabel}
      </Button>

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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items ({items.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
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
            <Button onClick={submit} disabled={!canSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Raise RFI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
