/**
 * MC-08 — Governance → AI Governance → Assurance.
 *
 * Formal supervisory assurance over AI usage. A review is opened against a
 * recorded AI activity, worked through the seven assurance criteria and
 * concluded. It never alters the AI output, its provenance or the supervisor's
 * own decision.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import {
  useAiActivity, useAiUseCases, useAssuranceCreate, useAssuranceReviews,
} from '@/hooks/useAiGovernance';
import {
  ASSESSMENT_LABEL, ASSESSMENT_VARIANT, ASSURANCE_CRITERIA, ASSURANCE_STATUS_LABEL,
  REMEDIATION_LABEL, label,
} from '@/lib/aiGovernanceLabels';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';

export default function AiAssurance() {
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAssurePrimary = useCan('ai_management', 'assure');
  const canAssureAlternate = useCan('ai_management', 'approve');
  const canAssure = canAssurePrimary || canAssureAlternate;
  const { data: reviews = [], isLoading } = useAssuranceReviews();
  const { data: useCases = [] } = useAiUseCases();
  const { data: reviewable = [] } = useAiActivity({ outcome: 'SUCCESS', limit: 100 });
  const create = useAssuranceCreate();

  const [statusFilter, setStatusFilter] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(
    () => reviews.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [reviews, statusFilter],
  );

  const reviewedInsightIds = new Set(reviews.map((r) => r.conduct_ai_insight_id));
  const candidates = reviewable.filter(
    (a) => a.conduct_ai_insight_id && !reviewedInsightIds.has(a.conduct_ai_insight_id),
  );

  const open = async () => {
    if (!selectedActivity) return;
    await create.mutateAsync({ insightId: selectedActivity, notes: notes.trim() || undefined });
    setPickerOpen(false);
    setSelectedActivity('');
    setNotes('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Assurance"
          description="Formal reviews of AI usage against the regulator's assurance criteria, with conclusions, remediation and closure evidence."
          actions={canAssure ? (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Open a review
            </Button>
          ) : <Badge variant="outline">Read only</Badge>}
        />

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription className="text-sm">
            An assurance review is held separately from the AI record. It cannot change the original AI output, its
            provenance or the supervisor's decision. Review statistics are a control measure, not a measure of
            individual employee performance.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">The seven assurance criteria</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {ASSURANCE_CRITERIA.map((c) => (
              <div key={c.code} className="rounded border p-2">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.help}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-56">
              <label className="text-xs text-muted-foreground">Review status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reviews</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_REVIEW">In review</SelectItem>
                  <SelectItem value="CLOSED">Concluded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No assurance review matches this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Capability</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Conclusion</TableHead>
                      <TableHead>Remediation</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead className="text-right">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                        <TableCell className="text-sm">
                          {useCases.find((u) => u.code === r.use_case_code)?.label ?? r.use_case_code ?? 'Not recorded'}
                        </TableCell>
                        <TableCell><Badge variant="outline">{label(ASSURANCE_STATUS_LABEL, r.status)}</Badge></TableCell>
                        <TableCell>
                          {r.conclusion ? (
                            <Badge variant={ASSESSMENT_VARIANT[r.conclusion] ?? 'outline'}>
                              {label(ASSESSMENT_LABEL, r.conclusion)}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">Not concluded</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.remediation_status ? label(REMEDIATION_LABEL, r.remediation_status) : '—'}
                          {r.remediation_due_date && (
                            <p className="text-muted-foreground">Due {formatDate(r.remediation_due_date)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/governance/ai/assurance/${r.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open an assurance review</DialogTitle>
            <DialogDescription>
              Select a recorded AI activity to review. The AI record itself is not changed by opening a review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>AI activity</Label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger><SelectValue placeholder="Select an AI activity" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((a) => (
                    <SelectItem key={a.conduct_ai_insight_id as string} value={a.conduct_ai_insight_id as string}>
                      {`${formatDateTime(a.occurred_at)} — ${a.use_case_label ?? a.use_case_code ?? 'AI activity'}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Every recorded AI activity already has a review, or none is available to you.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="assurance-notes">Opening note</Label>
              <Textarea id="assurance-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this activity is being reviewed." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={open} disabled={!selectedActivity || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Open review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
