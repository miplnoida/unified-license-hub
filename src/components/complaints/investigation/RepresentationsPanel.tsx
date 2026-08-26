/**
 * MC-03 — Formal representations (right to be heard).
 *
 * A respondent is invited to make representations against specific allegations
 * with a deadline. Late submissions require an explicit accept/reject decision
 * by review authority before they can be considered. Outcome readiness requires
 * every representation window to be closed.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquareWarning, Plus } from 'lucide-react';
import { SectionState } from '@/components/complaints/DataState';
import { formatDateTime } from '@/lib/datetime';
import {
  investigationOps,
  useInvestigationMutation,
  type InvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';

interface Props { complaintId: string; workspace: InvestigationWorkspace }

const TYPES = [
  { value: 'ALLEGATION_RESPONSE', label: 'Response to allegations' },
  { value: 'PRELIMINARY_FINDINGS', label: 'Response to preliminary findings' },
  { value: 'PROPOSED_ACTION', label: 'Response to proposed action' },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT_INVITATION: 'Invitation drafted',
  OPEN: 'Open — awaiting response',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  ACCEPTED_FOR_CONSIDERATION: 'Accepted for consideration',
  LATE_REVIEW_REQUIRED: 'Late — decision required',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
};

export function RepresentationsPanel({ complaintId, workspace }: Props) {
  const { representations, capabilities } = workspace;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    representing_party: '', representation_type: 'ALLEGATION_RESPONSE', due_at: '', scope_summary: '',
  });

  const openMut = useInvestigationMutation(complaintId, () =>
    investigationOps.representationOpen(complaintId, {
      ...draft,
      due_at: draft.due_at ? new Date(draft.due_at).toISOString() : '',
    }),
  );
  const reviewMut = useInvestigationMutation(
    complaintId,
    (a: { id: string; decision: 'UNDER_REVIEW' | 'ACCEPT_FOR_CONSIDERATION'; note: string | null; rv: number }) =>
      investigationOps.representationReview(a.id, a.decision, a.note, a.rv),
  );
  const extendMut = useInvestigationMutation(complaintId, (a: { id: string; due: string; reason: string; rv: number }) =>
    investigationOps.representationExtend(a.id, a.due, a.reason, a.rv),
  );
  const lateMut = useInvestigationMutation(complaintId, (a: { id: string; decision: 'ACCEPTED' | 'REJECTED'; reason: string }) =>
    investigationOps.representationLateDecision(a.id, a.decision, a.reason),
  );
  const closeMut = useInvestigationMutation(complaintId, (a: { id: string; note: string | null }) =>
    investigationOps.representationClose(a.id, a.note),
  );

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'That could not be saved'); }
  };

  const openCount = representations.filter((r) => !['CLOSED', 'WITHDRAWN'].includes(r.status)).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquareWarning className="h-4 w-4" />Representations
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            The respondent's opportunity to be heard before an outcome is decided.
            {openCount > 0 && ` ${openCount} window${openCount === 1 ? '' : 's'} still open.`}
          </p>
        </div>
        {capabilities.can_open_representation && (
          <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{adding ? 'Cancel' : 'Invite representations'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && capabilities.can_open_representation && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rep-party" className="text-xs">Who is invited</Label>
              <Input id="rep-party" value={draft.representing_party} onChange={(e) => setDraft({ ...draft, representing_party: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">What they are responding to</Label>
              <Select value={draft.representation_type} onValueChange={(v) => setDraft({ ...draft, representation_type: v })}>
                <SelectTrigger aria-label="Representation type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rep-due" className="text-xs">Response due by</Label>
              <Input id="rep-due" type="datetime-local" value={draft.due_at} onChange={(e) => setDraft({ ...draft, due_at: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rep-scope" className="text-xs">Scope of the invitation</Label>
              <Input id="rep-scope" value={draft.scope_summary} onChange={(e) => setDraft({ ...draft, scope_summary: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                disabled={openMut.isPending}
                onClick={async () => {
                  await run(openMut.mutateAsync(undefined as never), 'Representation window opened');
                  setAdding(false);
                  setDraft({ representing_party: '', representation_type: 'ALLEGATION_RESPONSE', due_at: '', scope_summary: '' });
                }}
              >
                {openMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Open the window
              </Button>
            </div>
          </div>
        )}

        <SectionState
          isLoading={false}
          isError={false}
          isEmpty={representations.length === 0}
          noun="representations"
          emptyText="No representations have been invited on this complaint."
        >
          <ul className="space-y-3">
            {representations.map((r) => {
              const due = r.extended_due_at ?? r.due_at;
              return (
                <li key={r.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.invitation_reference && <Badge variant="outline">{r.invitation_reference}</Badge>}
                    <p className="text-sm font-medium">{r.representing_party || 'Respondent'}</p>
                    <Badge variant={r.status === 'CLOSED' ? 'outline' : 'secondary'}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.is_late && <Badge variant="destructive" className="text-[10px]">Late</Badge>}
                    {r.allegation_numbers?.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        Allegations {r.allegation_numbers.map((n) => `A${n}`).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {TYPES.find((t) => t.value === r.representation_type)?.label ?? r.representation_type}
                    {due ? ` · due ${formatDateTime(due)}` : ''}
                    {r.submitted_at ? ` · submitted ${formatDateTime(r.submitted_at)}` : ''}
                  </p>
                  {r.extension_reason && (
                    <p className="text-xs text-muted-foreground">Extension reason: {r.extension_reason}</p>
                  )}
                  {r.narrative && <p className="text-sm whitespace-pre-wrap border-l-2 border-muted pl-3">{r.narrative}</p>}
                  {r.review_note && (
                    <p className="text-xs text-muted-foreground">
                      Review note: {r.review_note}{r.reviewed_at ? ` (${formatDateTime(r.reviewed_at)})` : ''}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {capabilities.can_review_representation && ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status) && (
                      <>
                        {r.status === 'SUBMITTED' && (
                          <Button
                            data-rbac="complaint_management.investigate"
                            size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => run(reviewMut.mutateAsync({ id: r.id, decision: 'UNDER_REVIEW', note: null, rv: r.row_version }), 'Marked under review')}
                          >
                            Mark under review
                          </Button>
                        )}
                        <Button
                          data-rbac="complaint_management.investigate"
                          size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={async () => {
                            const res = await Swal.fire({
                              title: 'Accept this representation for consideration?',
                              input: 'textarea', inputPlaceholder: 'Review note (optional)',
                              icon: 'question', showCancelButton: true, confirmButtonText: 'Accept',
                            });
                            if (!res.isConfirmed) return;
                            await run(reviewMut.mutateAsync({
                              id: r.id, decision: 'ACCEPT_FOR_CONSIDERATION',
                              note: (res.value as string) || null, rv: r.row_version,
                            }), 'Accepted for consideration');
                          }}
                        >
                          Accept for consideration
                        </Button>
                      </>
                    )}

                    {capabilities.can_open_representation && ['OPEN', 'DRAFT_INVITATION'].includes(r.status) && (
                      <Button
                        data-rbac="complaint_management.investigate"
                        size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={async () => {
                          const res = await Swal.fire({
                            title: 'Extend the deadline',
                            html: '<input id="swal-due" type="datetime-local" class="swal2-input" aria-label="New deadline" />'
                              + '<textarea id="swal-reason" class="swal2-textarea" placeholder="Reason for the extension"></textarea>',
                            showCancelButton: true, confirmButtonText: 'Extend',
                            preConfirm: () => {
                              const d = (document.getElementById('swal-due') as HTMLInputElement)?.value;
                              const reason = (document.getElementById('swal-reason') as HTMLTextAreaElement)?.value ?? '';
                              if (!d) { Swal.showValidationMessage('Choose the new deadline'); return false; }
                              if (reason.trim().length < 5) { Swal.showValidationMessage('Give a short reason'); return false; }
                              return { d, reason: reason.trim() };
                            },
                          });
                          if (!res.isConfirmed) return;
                          const { d, reason } = res.value as { d: string; reason: string };
                          await run(extendMut.mutateAsync({
                            id: r.id, due: new Date(d).toISOString(), reason, rv: r.row_version,
                          }), 'Deadline extended');
                        }}
                      >
                        Extend deadline
                      </Button>
                    )}

                    {capabilities.can_decide_late_representation && r.status === 'LATE_REVIEW_REQUIRED' && (
                      <>
                        {(['ACCEPTED', 'REJECTED'] as const).map((d) => (
                          <Button
                            data-rbac="complaint_management.approve"
                            key={d} size="sm" variant={d === 'ACCEPTED' ? 'outline' : 'ghost'} className="h-7 px-2 text-xs"
                            onClick={async () => {
                              const res = await Swal.fire({
                                title: d === 'ACCEPTED' ? 'Accept the late representation?' : 'Reject the late representation?',
                                input: 'textarea', inputLabel: 'Reason for the decision',
                                inputValidator: (v) => (String(v ?? '').trim().length < 10 ? 'Give at least 10 characters' : undefined),
                                showCancelButton: true, confirmButtonText: 'Record decision',
                              });
                              if (!res.isConfirmed) return;
                              await run(lateMut.mutateAsync({ id: r.id, decision: d, reason: String(res.value).trim() }), 'Decision recorded');
                            }}
                          >
                            {d === 'ACCEPTED' ? 'Accept late submission' : 'Reject late submission'}
                          </Button>
                        ))}
                      </>
                    )}

                    {capabilities.can_open_representation && !['CLOSED', 'WITHDRAWN'].includes(r.status) && (
                      <Button
                        data-rbac="complaint_management.investigate"
                        size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={async () => {
                          const res = await Swal.fire({
                            title: 'Close this representation window?',
                            text: 'Outcome review needs every window closed.',
                            input: 'textarea', inputPlaceholder: 'Closing note (optional)',
                            icon: 'question', showCancelButton: true, confirmButtonText: 'Close window',
                          });
                          if (!res.isConfirmed) return;
                          await run(closeMut.mutateAsync({ id: r.id, note: (res.value as string) || null }), 'Window closed');
                        }}
                      >
                        Close window
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionState>
      </CardContent>
    </Card>
  );
}

export default RepresentationsPanel;
