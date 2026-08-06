import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRaiseComplaintRfi, type ComplaintRfiQuestionType, type RaiseRfiQuestion } from '@/hooks/useComplaintRfis';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  complaintId: string;
  complaintNumber: string;
  licenseeId: string | null;
  onRaised?: () => void;
}

const emptyQuestion = (): RaiseRfiQuestion => ({ prompt: '', question_type: 'text', required: true });

export function RaiseComplaintRfiDialog({
  open,
  onOpenChange,
  complaintId,
  complaintNumber,
  licenseeId,
  onRaised,
}: Props) {
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [questions, setQuestions] = useState<RaiseRfiQuestion[]>([emptyQuestion()]);
  const raise = useRaiseComplaintRfi(complaintId);

  const update = (idx: number, patch: Partial<RaiseRfiQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const submit = async () => {
    const cleaned = questions
      .map((q) => ({ ...q, prompt: q.prompt.trim() }))
      .filter((q) => q.prompt.length > 0);
    if (!cleaned.length) {
      toast.error('Add at least one question');
      return;
    }
    try {
      const rfiId = await raise.mutateAsync({
        summary: summary.trim() || undefined,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        items: cleaned,
      });
      void dispatchNotificationEvent({
        event_key: 'complaint.rfi_issued',
        entity_type: 'complaint',
        entity_id: complaintId,
        payload: {
          complaint_id: complaintId,
          complaint_number: complaintNumber,
          licensee_id: licenseeId,
          entity_id: licenseeId,
          rfi_id: rfiId,
          question_count: cleaned.length,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          deep_link: `/entity/complaint-rfis?rfi=${rfiId}`,
        },
      });
      toast.success('Information request issued to the entity');
      setSummary('');
      setDueAt('');
      setQuestions([emptyQuestion()]);
      onOpenChange(false);
      onRaised?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not raise the information request');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise information request — {complaintNumber}</DialogTitle>
        </DialogHeader>

        {!licenseeId && (
          <p className="text-sm text-destructive">
            This complaint is not linked to a regulated entity. Link an entity before raising a request.
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Covering summary (optional)</Label>
            <Textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Context for the entity, e.g. which aspects of the complaint the request relates to"
            />
          </div>
          <div className="space-y-1">
            <Label>Response due date</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Questions</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}>
                <Plus className="h-4 w-4 mr-1" />Add question
              </Button>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono text-muted-foreground pt-2">Q{i + 1}</span>
                  <Textarea
                    rows={2}
                    className="flex-1"
                    value={q.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    placeholder="What information is being requested?"
                  />
                  {questions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuestions((qs) => qs.filter((_, x) => x !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap pl-6">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Response type</Label>
                    <Select
                      value={q.question_type}
                      onValueChange={(v) => update(i, { question_type: v as ComplaintRfiQuestionType })}
                    >
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Written answer</SelectItem>
                        <SelectItem value="document">Document only</SelectItem>
                        <SelectItem value="both">Written answer + document</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={q.required} onCheckedChange={(v) => update(i, { required: !!v })} />
                    Mandatory
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={raise.isPending || !licenseeId}>
            {raise.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Issue request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
