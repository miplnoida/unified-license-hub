import { useEffect, useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmployeeCombobox } from '@/components/entity-detail/EmployeeCombobox';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { toast } from 'sonner';
import { Loader2, FileText, Printer, Send, CheckCircle2, XCircle, Lock } from 'lucide-react';
import {
  useThematicReports, useThematicLetters, useClosureReadiness,
  useSaveThematicReportDraft, useSubmitThematicReport, useApproveThematicReport,
  useRejectThematicReport, usePublishThematicReport, useRequestThematicClosure,
  useApproveThematicClosure, useRejectThematicClosure, useMarkLetterDispatched,
  type ThematicReport,
} from '@/hooks/useThematicClosure';

const REPORT_BADGE: Record<string, any> = {
  draft: 'outline', in_review: 'secondary', approved: 'default', rejected: 'destructive', published: 'default',
};
const REPORT_LABEL: Record<string, string> = {
  draft: 'Draft', in_review: 'In review', approved: 'Approved', rejected: 'Rejected', published: 'Published',
};
const CLOSURE_LABEL: Record<string, string> = {
  not_requested: 'Not requested', pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected',
};

interface Props {
  reviewId: string;
  review: any;
  findings: any[];
  actions: any[];
  onChange: () => void;
}

const EMPTY_FORM = {
  title: '', executive_summary: '', background: '', scope_methodology: '',
  key_findings: '', required_actions: '', regulatory_learning: '',
};

export function ThematicClosurePanel({ reviewId, review, findings, actions, onChange }: Props) {
  const reports = useThematicReports(reviewId);
  const letters = useThematicLetters(reviewId);
  const readiness = useClosureReadiness(reviewId);
  const approvers = useEmployeeApprovers();

  const saveDraft = useSaveThematicReportDraft(reviewId);
  const submitReport = useSubmitThematicReport(reviewId);
  const approveReport = useApproveThematicReport(reviewId);
  const rejectReport = useRejectThematicReport(reviewId);
  const publishReport = usePublishThematicReport(reviewId);
  const requestClosure = useRequestThematicClosure(reviewId);
  const approveClosure = useApproveThematicClosure(reviewId);
  const rejectClosure = useRejectThematicClosure(reviewId);
  const markDispatched = useMarkLetterDispatched(reviewId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [approverId, setApproverId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ThematicReport | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const rows = reports.data || [];
  const selected = useMemo(() => rows.find(r => r.id === selectedId) || rows[0] || null, [rows, selectedId]);
  const editable = !selected || selected.status === 'draft' || selected.status === 'rejected';

  useEffect(() => {
    if (!selected) { setForm(EMPTY_FORM); return; }
    setForm({
      title: selected.title || '',
      executive_summary: selected.executive_summary || '',
      background: selected.background || '',
      scope_methodology: selected.scope_methodology || '',
      key_findings: selected.key_findings || '',
      required_actions: selected.required_actions || '',
      regulatory_learning: selected.regulatory_learning || '',
    });
    setApproverId(selected.approver_id || null);
  }, [selected?.id]);

  const approverOptions = (approvers.data || []).map((a: any) => ({
    id: a.id,
    label: a.full_name || a.email || a.id,
    sublabel: [a.designation, a.department, a.email].filter(Boolean).join(' · ') || null,
    inactive: a.status ? a.status !== 'active' : false,
  }));

  const prefill = () => {
    setForm(f => ({
      ...f,
      key_findings: f.key_findings || findings.map((x: any) => `[${x.severity}] ${x.title}${x.detail ? ` — ${x.detail}` : ''}`).join('\n'),
      required_actions: f.required_actions || actions.map((a: any) => `${a.title}${a.due_date ? ` (due ${a.due_date})` : ''}`).join('\n'),
      scope_methodology: f.scope_methodology || `Scope period ${review.scope_start || '—'} to ${review.scope_end || '—'}.`,
      background: f.background || review.description || '',
    }));
  };

  const onSave = async () => {
    try {
      await saveDraft.mutateAsync({
        _review_id: reviewId,
        _report_id: selected && editable ? selected.id : null,
        _title: form.title || null,
        _executive_summary: form.executive_summary || null,
        _background: form.background || null,
        _scope_methodology: form.scope_methodology || null,
        _key_findings: form.key_findings || null,
        _required_actions: form.required_actions || null,
        _regulatory_learning: form.regulatory_learning || null,
      });
      toast.success('Report draft saved');
      onChange();
    } catch (e: any) { toast.error(e.message); }
  };

  const printReport = () => {
    if (!selected) return;
    const esc = (s: string | null) => (s || '—').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
    const html = `<!doctype html><html><head><title>${esc(selected.title)}</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;margin:40px;line-height:1.55;color:#111}
      h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;margin-top:26px;text-transform:uppercase;letter-spacing:.05em;color:#1E3A8A}
      .meta{font-size:12px;color:#555;margin-bottom:24px}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style></head>
      <body><h1>${esc(selected.title)}</h1>
      <div class="meta">${esc(review.code)} · ${esc(review.title)} · Version ${selected.version} · ${REPORT_LABEL[selected.status]}
      ${selected.published_at ? ` · Published ${new Date(selected.published_at).toLocaleDateString()}` : ''}</div>
      <h2>Executive summary</h2><pre>${esc(selected.executive_summary)}</pre>
      <h2>Background</h2><pre>${esc(selected.background)}</pre>
      <h2>Scope and methodology</h2><pre>${esc(selected.scope_methodology)}</pre>
      <h2>Key findings</h2><pre>${esc(selected.key_findings)}</pre>
      <h2>Required actions</h2><pre>${esc(selected.required_actions)}</pre>
      <h2>Regulatory learning</h2><pre>${esc(selected.regulatory_learning)}</pre>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Allow pop-ups to print the report');
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onChange(); } catch (e: any) { toast.error(e.message); }
  };

  const rd = readiness.data;

  return (
    <div className="space-y-4">
      {/* Readiness + closure state */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Closure readiness</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Gate label="Published report" ok={!!rd?.published_report_id} value={rd?.published_report_id ? 'Published' : 'Not published'} />
          <Gate label="Unverified actions" ok={(rd?.unverified_actions ?? 1) === 0} value={String(rd?.unverified_actions ?? '—')} />
          <Gate label="Draft findings" ok={(rd?.open_findings ?? 1) === 0} value={String(rd?.open_findings ?? '—')} />
          <Gate label="Letters pending dispatch" ok={(rd?.pending_letters ?? 1) === 0} value={String(rd?.pending_letters ?? '—')} />
          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 pt-2 border-t">
            <span className="text-xs uppercase text-muted-foreground">Closure state</span>
            <Badge variant={review.closure_state === 'approved' ? 'default' : review.closure_state === 'rejected' ? 'destructive' : review.closure_state === 'pending_approval' ? 'secondary' : 'outline'}>
              {CLOSURE_LABEL[review.closure_state] || review.closure_state}
            </Badge>
            {review.closure_rejection_reason && review.closure_state === 'rejected' && (
              <span className="text-xs text-destructive">Rejected: {review.closure_rejection_reason}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report artefact */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Report artefact</CardTitle>
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={selected?.id || ''} onChange={e => setSelectedId(e.target.value)}>
                {rows.map(r => <option key={r.id} value={r.id}>v{r.version} · {REPORT_LABEL[r.status]}</option>)}
              </select>
            )}
            <Button data-rbac="prudential_supervision.create" size="sm" variant="outline" onClick={() => { setSelectedId(null); setForm(EMPTY_FORM); }}>
              <FileText className="h-4 w-4 mr-1" /> New version
            </Button>
            {selected && <Button data-rbac="prudential_supervision.view" size="sm" variant="outline" onClick={printReport}><Printer className="h-4 w-4 mr-1" /> Print / PDF</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={REPORT_BADGE[selected.status]}>{REPORT_LABEL[selected.status]}</Badge>
              <span>Version {selected.version}</span>
              {selected.submitted_at && <span>· submitted {new Date(selected.submitted_at).toLocaleString()}</span>}
              {selected.approved_at && <span>· approved {new Date(selected.approved_at).toLocaleString()}</span>}
              {selected.published_at && <span>· published {new Date(selected.published_at).toLocaleString()}</span>}
              {selected.status === 'rejected' && selected.rejection_reason && (
                <span className="text-destructive">· rejected: {selected.rejection_reason}</span>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <div><Label>Report title</Label><Input disabled={!editable} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Thematic review report" /></div>
            <Field label="Executive summary" v={form.executive_summary} rows={4} disabled={!editable} onChange={v => setForm({ ...form, executive_summary: v })} />
            <Field label="Background" v={form.background} rows={3} disabled={!editable} onChange={v => setForm({ ...form, background: v })} />
            <Field label="Scope and methodology" v={form.scope_methodology} rows={3} disabled={!editable} onChange={v => setForm({ ...form, scope_methodology: v })} />
            <Field label="Key findings" v={form.key_findings} rows={5} disabled={!editable} onChange={v => setForm({ ...form, key_findings: v })} />
            <Field label="Required actions" v={form.required_actions} rows={4} disabled={!editable} onChange={v => setForm({ ...form, required_actions: v })} />
            <Field label="Regulatory learning" v={form.regulatory_learning} rows={3} disabled={!editable} onChange={v => setForm({ ...form, regulatory_learning: v })} />
          </div>

          {editable && (
            <div className="flex flex-wrap gap-2 items-end">
              <Button data-rbac="prudential_supervision.edit" variant="outline" size="sm" onClick={prefill}>Prefill from findings & actions</Button>
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={onSave} disabled={saveDraft.isPending}>
                {saveDraft.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save draft
              </Button>
              {selected && (
                <div className="flex items-end gap-2">
                  <div className="w-64">
                    <Label className="text-xs">Nominated approver (optional)</Label>
                    <EmployeeCombobox value={approverId} options={approverOptions} onChange={setApproverId} placeholder="Shared supervisor queue" testId="thematic-report-approver" />
                  </div>
                  <Button data-rbac="prudential_supervision.edit" size="sm" variant="secondary"
                    onClick={() => run(() => submitReport.mutateAsync({ _report_id: selected.id, _approver_id: approverId }), 'Submitted for approval')}
                    disabled={submitReport.isPending}>
                    Submit for approval
                  </Button>
                </div>
              )}
            </div>
          )}

          {selected?.status === 'in_review' && (
            <div className="flex gap-2 pt-2 border-t">
              <Button data-rbac="prudential_supervision.workflow_action" size="sm"
                onClick={() => run(() => approveReport.mutateAsync({ _report_id: selected.id }), 'Report approved')}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve report
              </Button>
              <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => { setRejectTarget(selected); setRejectReason(''); }}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          )}

          {selected?.status === 'approved' && (
            <div className="pt-2 border-t">
              <Button data-rbac="prudential_supervision.workflow_action" size="sm"
                onClick={() => run(async () => {
                  const staged = await publishReport.mutateAsync({ _report_id: selected.id });
                  toast.info(`${staged ?? 0} supervisory letter(s) staged`);
                }, 'Report published')}
                disabled={publishReport.isPending}>
                <Lock className="h-4 w-4 mr-1" /> Publish report & generate supervisory letters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supervisory letters */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Supervisory letters ({(letters.data || []).length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(letters.data || []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Letters are generated automatically when a report is published.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Entity</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead>
                <TableHead>Dispatched</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{(letters.data || []).map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{l.recipient_name || '—'}</TableCell>
                  <TableCell className="text-xs max-w-md">
                    <div className="font-medium">{l.subject}</div>
                    <details><summary className="cursor-pointer text-muted-foreground">View letter</summary>
                      <pre className="whitespace-pre-wrap mt-1">{l.body}</pre></details>
                  </TableCell>
                  <TableCell><Badge variant={l.status === 'dispatched' ? 'default' : l.status === 'failed' ? 'destructive' : 'outline'}>{l.status}</Badge></TableCell>
                  <TableCell className="text-xs">{l.dispatched_at ? new Date(l.dispatched_at).toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-right">
                    {l.status !== 'dispatched' && (
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                        onClick={() => run(() => markDispatched.mutateAsync({ letterId: l.id }), 'Letter marked dispatched')}>
                        <Send className="h-4 w-4 mr-1" /> Mark dispatched
                      </Button>
                    )}
                  </TableCell>
                </TableRow>))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Closure gate */}
      <ClosureGateCard
        review={review}
        reviewId={reviewId}
        approverOptions={approverOptions}
        readiness={rd}
        onDone={() => { onChange(); readiness.refetch(); }}
        requestClosure={requestClosure}
        approveClosure={approveClosure}
        rejectClosure={rejectClosure}
      />

      {/* Reject report dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={o => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject report v{rejectTarget?.version}</DialogTitle></DialogHeader>
          <Label>Reason (min 10 characters)</Label>
          <Textarea rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <GuardedButton module="prudential_supervision" action="edit" data-rbac="prudential_supervision.edit" variant="destructive" disabled={rejectReason.trim().length < 10}
              onClick={() => run(async () => {
                await rejectReport.mutateAsync({ _report_id: rejectTarget!.id, _reason: rejectReason.trim() });
                setRejectTarget(null);
              }, 'Report rejected')}>
              Reject report
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClosureGateCard({ review, reviewId, approverOptions, readiness, onDone, requestClosure, approveClosure, rejectClosure }: any) {
  const [summary, setSummary] = useState(review.closure_summary || '');
  const [approverId, setApproverId] = useState<string | null>(review.closure_approver_id || null);
  const [learning, setLearning] = useState({
    what_worked: review.regulatory_learning?.what_worked || '',
    systemic_issues: review.regulatory_learning?.systemic_issues || '',
    guidance_updates: review.regulatory_learning?.guidance_updates || '',
    supervisory_changes: review.regulatory_learning?.supervisory_changes || '',
  });
  const [overrideReason, setOverrideReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const blocked = (readiness?.unverified_actions ?? 0) > 0;
  const closed = review.status === 'closed';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onDone(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Closure & regulatory learning</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {closed ? (
          <p className="text-sm text-muted-foreground">
            Closed {review.closed_at ? new Date(review.closed_at).toLocaleString() : ''}. Closure summary and regulatory learning are locked.
          </p>
        ) : null}

        <Field label="Closure summary (min 20 characters)" v={summary} rows={4} disabled={closed || review.closure_state === 'pending_approval'} onChange={setSummary} />
        <div className="grid md:grid-cols-2 gap-3">
          {([
            ['what_worked', 'What worked well'],
            ['systemic_issues', 'Systemic issues identified'],
            ['guidance_updates', 'Guidance / rule changes proposed'],
            ['supervisory_changes', 'Changes to supervisory approach'],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label} v={(learning as any)[k]} rows={2}
              disabled={closed || review.closure_state === 'pending_approval'}
              onChange={v => setLearning({ ...learning, [k]: v })} />
          ))}
        </div>

        {!closed && review.closure_state !== 'pending_approval' && (
          <>
            {blocked && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                <p className="text-destructive font-medium">
                  {readiness.unverified_actions} required action(s) are not verified — closure is blocked.
                </p>
                <p className="text-xs text-muted-foreground">
                  Verify the outstanding actions in the Follow-up register, or record a documented override justification below.
                </p>
                <Textarea rows={2} placeholder="Override justification (min 10 characters)" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
              </div>
            )}
            <div className="flex items-end gap-2 flex-wrap">
              <div className="w-64">
                <Label className="text-xs">Closure approver (optional)</Label>
                <EmployeeCombobox value={approverId} options={approverOptions} onChange={setApproverId} placeholder="Shared supervisor queue" testId="thematic-closure-approver" />
              </div>
              <Button data-rbac="prudential_supervision.edit" size="sm"
                disabled={summary.trim().length < 20 || (blocked && overrideReason.trim().length < 10) || requestClosure.isPending}
                onClick={() => run(() => requestClosure.mutateAsync({
                  _review_id: reviewId,
                  _closure_summary: summary.trim(),
                  _regulatory_learning: learning,
                  _approver_id: approverId,
                  _override_id: blocked ? crypto.randomUUID() : null,
                  _override_reason: blocked ? overrideReason.trim() : null,
                }), 'Closure submitted for approval')}>
                Submit for closure approval
              </Button>
            </div>
          </>
        )}

        {review.closure_state === 'pending_approval' && (
          <div className="flex gap-2 pt-2 border-t">
            <Button data-rbac="prudential_supervision.workflow_action" size="sm"
              onClick={() => run(() => approveClosure.mutateAsync({ _review_id: reviewId, _note: null }), 'Closure approved — review closed')}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve closure
            </Button>
            <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-4 w-4 mr-1" /> Reject closure
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject closure request</DialogTitle></DialogHeader>
          <Label>Reason (min 10 characters)</Label>
          <Textarea rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <GuardedButton module="prudential_supervision" action="edit" data-rbac="prudential_supervision.edit" variant="destructive" disabled={rejectReason.trim().length < 10}
              onClick={() => run(async () => {
                await rejectClosure.mutateAsync({ _review_id: reviewId, _reason: rejectReason.trim() });
                setRejectOpen(false); setRejectReason('');
              }, 'Closure rejected')}>
              Reject closure
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, v, rows, disabled, onChange }: { label: string; v: string; rows: number; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea rows={rows} value={v} disabled={disabled} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Gate({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${ok ? 'text-green-600' : 'text-destructive'}`}>{value}</p>
    </div>
  );
}
