/**
 * MC-07.5 — Human review of an AI advisory.
 *
 * The supervisor is the decision maker. Modify and Reject both require a written
 * rationale, and Modify additionally requires the supervisor's own wording. The
 * original AI text is always shown alongside so the record stays honest about
 * what was suggested versus what a human approved.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { REVIEW_ACTION_META, USE_CASE_META, type AdvisoryUseCase, type ReviewAction } from '@/lib/conductAdvisoryLabels';
import type { AdvisoryInsight } from '@/hooks/useConductAdvisory';
import { advisoryPlainText } from './advisoryText';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insight: AdvisoryInsight | null;
  action: ReviewAction | null;
  submitting: boolean;
  onSubmit: (input: { action: ReviewAction; rationale?: string; humanText?: string }) => Promise<void>;
}

export function AdvisoryReviewDialog({ open, onOpenChange, insight, action, submitting, onSubmit }: Props) {
  const [rationale, setRationale] = useState('');
  const [humanText, setHumanText] = useState('');

  const meta = action ? REVIEW_ACTION_META[action] : null;
  const original = insight ? advisoryPlainText(insight.ai_output) : '';

  useEffect(() => {
    if (open) {
      setRationale('');
      setHumanText(action === 'modify' ? original : '');
    }
  }, [open, action, original]);

  if (!insight || !action || !meta) return null;

  const useCaseLabel = USE_CASE_META[insight.use_case_code as AdvisoryUseCase]?.label ?? 'Advisory';
  const rationaleMissing = meta.rationaleRequired && rationale.trim().length < 10;
  const textMissing = meta.textRequired && humanText.trim().length < 10;

  const handleSubmit = async () => {
    if (rationaleMissing || textMissing) return;
    try {
      await onSubmit({ action, rationale: rationale.trim() || undefined, humanText: humanText.trim() || undefined });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This decision could not be recorded.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{meta.label} — {useCaseLabel}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Your decision is recorded against this advisory only. It does not change any risk rating, case status,
              investigation or regulatory decision.
            </AlertDescription>
          </Alert>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Original AI suggestion</Label>
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {original || 'No narrative recorded.'}
            </div>
          </div>

          {meta.textRequired && (
            <div>
              <Label htmlFor="advisory-human-text">
                Your approved wording <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="advisory-human-text"
                rows={6}
                value={humanText}
                onChange={(e) => setHumanText(e.target.value)}
                placeholder="Enter the wording you are prepared to stand behind as the supervisor."
              />
              {textMissing && (
                <p className="mt-1 text-xs text-destructive">Enter at least 10 characters of your own wording.</p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="advisory-rationale">
              Rationale {meta.rationaleRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <Textarea
              id="advisory-rationale"
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder={
                action === 'reject'
                  ? 'Explain why this advisory should not be relied on.'
                  : 'Explain the basis for your decision.'
              }
            />
            {rationaleMissing && (
              <p className="mt-1 text-xs text-destructive">A rationale of at least 10 characters is required.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || rationaleMissing || textMissing}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record {meta.label.toLowerCase()} decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
