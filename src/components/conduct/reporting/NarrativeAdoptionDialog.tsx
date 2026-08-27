/**
 * MC-11 — Adoption of a reviewed narrative into a named report section.
 *
 * Adoption is the point at which drafting help becomes part of a supervisory
 * report, so it is a deliberate, reasoned and permanently recorded act. The
 * server refuses an unreviewed or stale narrative; this dialog makes the same
 * expectations explicit before the supervisor commits.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { USE_CASE_META, reviewStateLabel, type AdvisoryUseCase } from '@/lib/conductAdvisoryLabels';
import type { ReportingNarrative } from '@/hooks/useConductMI';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  narrative: ReportingNarrative | null;
  submitting: boolean;
  onSubmit: (input: { section: string; rationale: string }) => Promise<void>;
}

const SUGGESTED_SECTIONS = [
  'Management summary',
  'Movement commentary',
  'Emerging risk commentary',
  'Coverage commentary',
  'Evidence pack summary',
];

export function NarrativeAdoptionDialog({ open, onOpenChange, narrative, submitting, onSubmit }: Props) {
  const [section, setSection] = useState('');
  const [rationale, setRationale] = useState('');

  useEffect(() => {
    if (open) {
      setSection('');
      setRationale('');
    }
  }, [open]);

  if (!narrative) return null;

  const label = USE_CASE_META[narrative.use_case_code as AdvisoryUseCase]?.label ?? 'Narrative';
  const sectionMissing = section.trim().length < 3;
  const rationaleMissing = rationale.trim().length < 10;

  const handleSubmit = async () => {
    if (sectionMissing || rationaleMissing) return;
    try {
      await onSubmit({ section: section.trim(), rationale: rationale.trim() });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This narrative could not be adopted.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adopt into a report section — {label}</DialogTitle>
          <DialogDescription>
            Adopting records that you, as the supervisor, take responsibility for this wording appearing in the
            report. The adoption record cannot be edited or removed afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Current review state: <strong>{reviewStateLabel(narrative.review_state)}</strong>. Only an accepted or
              modified narrative whose underlying figures are still current can be adopted.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="adopt-section">
              Report section <span className="text-destructive">*</span>
            </Label>
            <Input
              id="adopt-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Management summary"
              list="adopt-section-suggestions"
            />
            <datalist id="adopt-section-suggestions">
              {SUGGESTED_SECTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
            {sectionMissing && (
              <p className="mt-1 text-xs text-destructive">Name the report section this wording belongs to.</p>
            )}
          </div>

          <div>
            <Label htmlFor="adopt-rationale">
              Reason for adoption <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="adopt-rationale"
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Explain why this wording is appropriate for the report and consistent with the published figures."
            />
            {rationaleMissing && (
              <p className="mt-1 text-xs text-destructive">A reason of at least 10 characters is required.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button data-rbac="market_conduct.manage_complaints" onClick={handleSubmit} disabled={submitting || sectionMissing || rationaleMissing}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adopt into report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
