/**
 * P04 A.7 / A.8 — licence conditions as monitored obligations.
 *
 * Evidence submission moves a condition into review; only the governed
 * regulator review concludes it (satisfy / waive / vary / return / breach).
 * The consequence of a breach is decided by server configuration — this panel
 * never infers or applies one.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ClipboardCheck, Loader2, Upload } from 'lucide-react';
import {
  useLicenseConditions, useLicenseConditionEvidence, useReviewCondition,
  useSubmitConditionEvidence, type ConditionDecision, type LicenseCondition,
} from '@/hooks/useLicenseConditions';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'outline',
  in_progress: 'outline',
  evidence_due: 'outline',
  under_review: 'secondary',
  satisfied: 'default',
  waived: 'secondary',
  varied: 'secondary',
  breached: 'destructive',
  closed: 'secondary',
};

const DECISIONS: Array<{ key: ConditionDecision; label: string; needsReason: boolean; destructive?: boolean }> = [
  { key: 'SATISFY', label: 'Mark satisfied', needsReason: false },
  { key: 'RETURN_FOR_EVIDENCE', label: 'Return for evidence', needsReason: true },
  { key: 'VARY', label: 'Vary condition', needsReason: true },
  { key: 'WAIVE', label: 'Waive condition', needsReason: true },
  { key: 'BREACH', label: 'Record breach', needsReason: true, destructive: true },
];

function label(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : '—';
}

export default function LicenseConditionsPanel({
  licenseId,
  isInternal,
}: {
  licenseId: string;
  isInternal: boolean;
}) {
  const { data: conditions = [], isLoading } = useLicenseConditions(licenseId);
  const { data: evidence = [] } = useLicenseConditionEvidence(licenseId);
  const review = useReviewCondition(licenseId);
  const submitEvidence = useSubmitConditionEvidence(licenseId);

  const [reviewTarget, setReviewTarget] = useState<{ condition: LicenseCondition; decision: ConditionDecision } | null>(null);
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [evidenceTarget, setEvidenceTarget] = useState<LicenseCondition | null>(null);
  const [summary, setSummary] = useState('');

  const closeReview = () => { setReviewTarget(null); setReason(''); setDueDate(''); };

  const runReview = async () => {
    if (!reviewTarget) return;
    try {
      await review.mutateAsync({
        conditionId: reviewTarget.condition.id,
        decision: reviewTarget.decision,
        reason: reason.trim() || undefined,
        payload: dueDate ? { due_date: dueDate } : {},
      });
      toast.success('Condition review recorded');
      closeReview();
    } catch (e: any) {
      toast.error(e?.message ?? 'Review failed');
    }
  };

  const runSubmitEvidence = async () => {
    if (!evidenceTarget) return;
    try {
      await submitEvidence.mutateAsync({ conditionId: evidenceTarget.id, summary: summary.trim() });
      toast.success('Evidence submitted for regulator review');
      setEvidenceTarget(null);
      setSummary('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Submission failed');
    }
  };

  const decisionMeta = reviewTarget ? DECISIONS.find((d) => d.key === reviewTarget.decision) : null;
  const reasonTooShort = !!decisionMeta?.needsReason && reason.trim().length < 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Licence Conditions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : conditions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No conditions attached to this licence.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conditions.map((c) => {
                  const count = evidence.filter((e) => e.condition_id === c.id).length;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.condition_reference ?? c.requirement_ref ?? '—'}</TableCell>
                      <TableCell className="max-w-[22rem]">
                        <p className="text-sm">{c.description ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{label(c.category)}{c.source_decision ? ` · ${label(c.source_decision)}` : ''}</p>
                        {c.breach_consequence && (
                          <p className="text-xs text-destructive">Consequence applied: {label(c.breach_consequence)}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{c.owner_team ?? c.monitoring_owner ?? '—'}</TableCell>
                      <TableCell className="text-sm">{c.effective_date ? new Date(c.effective_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-sm">{c.due_date ? new Date(c.due_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-sm">{c.evidence_required ? `${count} submitted` : 'Not required'}</TableCell>
                      <TableCell className="text-sm">{label(c.review_state)}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{label(c.status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        {isInternal ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            {['satisfied', 'waived', 'closed'].includes(c.status) ? (
                              <span className="text-xs text-muted-foreground">Concluded</span>
                            ) : (
                              DECISIONS.map((d) => (
                                <Button
                                  key={d.key}
                                  data-rbac="license_management.manage_conditions"
                                  size="sm"
                                  variant={d.destructive ? 'destructive' : 'outline'}
                                  onClick={() => { setReviewTarget({ condition: c, decision: d.key }); setReason(''); setDueDate(''); }}
                                >
                                  {d.label}
                                </Button>
                              ))
                            )}
                          </div>
                        ) : ['satisfied', 'waived', 'closed'].includes(c.status) ? (
                          <span className="text-xs text-muted-foreground">Concluded</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setEvidenceTarget(c); setSummary(''); }}>
                            <Upload className="mr-1 h-3.5 w-3.5" />Submit evidence
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionMeta?.label}</DialogTitle>
            <DialogDescription>
              Recorded as a governed regulator decision against the condition. Any breach consequence is applied
              from the licence lifecycle configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="condition-reason">Rationale{decisionMeta?.needsReason ? ' (required, min 10 characters)' : ' (optional)'}</Label>
              <Textarea id="condition-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </div>
            {(reviewTarget?.decision === 'VARY' || reviewTarget?.decision === 'RETURN_FOR_EVIDENCE') && (
              <div>
                <Label htmlFor="condition-due">Revised due date</Label>
                <Input id="condition-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReview}>Cancel</Button>
            <Button
              variant={decisionMeta?.destructive ? 'destructive' : 'default'}
              disabled={reasonTooShort || review.isPending}
              onClick={runReview}
            >
              {review.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!evidenceTarget} onOpenChange={(o) => !o && setEvidenceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit condition evidence</DialogTitle>
            <DialogDescription>
              Submitting evidence places the condition under regulator review. It does not satisfy the condition.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="evidence-summary">Summary of evidence</Label>
            <Textarea id="evidence-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceTarget(null)}>Cancel</Button>
            <Button disabled={summary.trim().length < 5 || submitEvidence.isPending} onClick={runSubmitEvidence}>
              {submitEvidence.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Submit for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
