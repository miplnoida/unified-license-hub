import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import {
  useInvestigationClosures, useClosureReadiness, useSaveClosureDraft, useSubmitClosure,
  useApproveClosure, useRejectClosure, useLinkEnforcement, useClosureBreaches,
  DISCONTINUATION_GROUNDS, type DeterminationType, type InvestigationClosure,
} from '@/hooks/useInvestigationClosure';
import { PostClosureMonitoringPanel } from './PostClosureMonitoringPanel';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  Loader2, Gavel, Save, Send, CheckCircle2, XCircle, Printer, AlertTriangle, ShieldAlert,
} from 'lucide-react';

const DETERMINATIONS: Array<{ value: DeterminationType; label: string; help: string }> = [
  { value: 'closure_with_enforcement', label: 'Closure — refer to enforcement',
    help: 'Breaches substantiated; the matter proceeds to an enforcement case.' },
  { value: 'closure_no_further_action', label: 'Closure — no further action',
    help: 'Investigation complete; supervisory outcome recorded without enforcement.' },
  { value: 'discontinuation', label: 'Discontinuation',
    help: 'The investigation cannot or need not proceed; a ground must be recorded.' },
];

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline', pending_approval: 'secondary', approved: 'default', rejected: 'destructive',
};

const ENFORCEMENT_TYPES = ['warning', 'directive', 'administrative_penalty', 'licence_action', 'prosecution_referral'];

export function ClosurePanel({
  investigationId, investigation,
}: { investigationId: string; investigation: any }) {
  const { data: closures, isLoading } = useInvestigationClosures(investigationId);
  const readiness = useClosureReadiness(investigationId);
  const saveDraft = useSaveClosureDraft(investigationId);
  const submit = useSubmitClosure(investigationId);
  const approve = useApproveClosure(investigationId);
  const reject = useRejectClosure(investigationId);
  const linkEnf = useLinkEnforcement(investigationId);
  const { data: employees = [] } = useEmployeeApprovers();

  const rows = closures ?? [];
  const current: InvestigationClosure | undefined = rows[0];
  const { data: breaches = [] } = useClosureBreaches(current?.id);

  const [determination, setDetermination] = useState<DeterminationType>('closure_no_further_action');
  const [findings, setFindings] = useState('');
  const [evidence, setEvidence] = useState('');
  const [rationale, setRationale] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [learning, setLearning] = useState('');
  const [ground, setGround] = useState('none');
  const [groundDetail, setGroundDetail] = useState('');
  const [letter, setLetter] = useState(false);
  const [approverId, setApproverId] = useState('none');
  const [enforcementType, setEnforcementType] = useState('warning');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!current || hydratedFor === current.id) return;
    setDetermination(current.determination_type);
    setFindings(current.findings_summary ?? '');
    setEvidence(current.evidence_relied_upon ?? '');
    setRationale(current.rationale ?? '');
    setNextSteps(current.next_steps ?? '');
    setLearning(current.regulatory_learning ?? '');
    setGround(current.discontinuation_ground ?? 'none');
    setGroundDetail(current.discontinuation_detail ?? '');
    setLetter(current.entity_letter_required);
    setApproverId(current.approver_id ?? 'none');
    setHydratedFor(current.id);
  }, [current, hydratedFor]);

  const editable = !current || current.status === 'draft' || current.status === 'rejected';
  const pending = current?.status === 'pending_approval';
  const approved = current?.status === 'approved';
  const r = readiness.data;
  const blockers: string[] = [];
  if (r) {
    if (r.unfinalised_interviews > 0) blockers.push(`${r.unfinalised_interviews} interview record(s) not finalised`);
    if (r.open_actions > 0) blockers.push(`${r.open_actions} supervisory action(s) still open`);
    if (r.evidence_count === 0) blockers.push('no evidence items recorded');
  }
  const hardBlockers = blockers.filter(b => !b.includes('no evidence items'));

  // Plain-language list of the field requirements that still block submission.
  const submitMissing: string[] = [];
  if (findings.trim().length < 20) {
    submitMissing.push(
      `Summary of findings needs at least 20 characters (currently ${findings.trim().length}).`,
    );
  }
  if (rationale.trim().length < 20) {
    submitMissing.push(
      `Determination rationale needs at least 20 characters (currently ${rationale.trim().length}).`,
    );
  }
  if (determination === 'discontinuation' && ground === 'none') {
    submitMissing.push('Select a discontinuation ground.');
  }
  if (determination === 'discontinuation' && ground === 'other' && !groundDetail.trim()) {
    submitMissing.push('Add the ground detail for "other".');
  }


  const persist = async (): Promise<string | null> => {
    try {
      const id = await saveDraft.mutateAsync({
        investigation_id: investigationId,
        closure_id: current && editable ? current.id : null,
        determination_type: determination,
        findings_summary: findings || null,
        evidence_relied_upon: evidence || null,
        rationale: rationale || null,
        next_steps: nextSteps || null,
        regulatory_learning: learning || null,
        discontinuation_ground: determination === 'discontinuation' && ground !== 'none' ? ground : null,
        discontinuation_detail: groundDetail || null,
        entity_letter_required: letter,
        approver_id: approverId === 'none' ? null : approverId,
      });
      return id;
    } catch { return null; }
  };

  const onSubmit = async () => {
    const id = await persist();
    if (!id) return;
    let overrideReason: string | null = null;
    if (hardBlockers.length) {
      const res = await Swal.fire({
        title: 'Readiness gate not met',
        html: `<div style="text-align:left;font-size:13px">${hardBlockers.map(b => `• ${b}`).join('<br/>')}</div>`,
        input: 'textarea',
        inputLabel: 'Documented override reason (min 10 characters)',
        inputValidator: v => (!v || v.trim().length < 10 ? 'An override reason of at least 10 characters is required' : null),
        showCancelButton: true, confirmButtonText: 'Submit with override',
      });
      if (!res.isConfirmed) return;
      overrideReason = res.value;
    }
    await submit.mutateAsync({
      closure_id: id,
      approver_id: approverId === 'none' ? null : approverId,
      override_reason: overrideReason,
    });
  };

  const onApprove = async () => {
    if (!current) return;
    const res = await Swal.fire({
      title: determination === 'discontinuation' ? 'Approve discontinuation?' : 'Approve closure?',
      text: 'This concludes the investigation and activates any post-closure monitoring directive.',
      input: 'textarea', inputLabel: 'Decision note (optional)',
      showCancelButton: true, confirmButtonText: 'Approve',
    });
    if (!res.isConfirmed) return;
    await approve.mutateAsync({ closure_id: current.id, decision_note: res.value || null });
  };

  const onReject = async () => {
    if (!current) return;
    const res = await Swal.fire({
      title: 'Return to investigator',
      input: 'textarea', inputLabel: 'Reason (min 10 characters)',
      inputValidator: v => (!v || v.trim().length < 10 ? 'A reason of at least 10 characters is required' : null),
      showCancelButton: true, confirmButtonText: 'Return closure',
    });
    if (!res.isConfirmed) return;
    await reject.mutateAsync({ closure_id: current.id, reason: res.value });
  };

  const onReferEnforcement = async (createNew: boolean) => {
    let id = current?.id;
    if (!id || editable) {
      const saved = await persist();
      if (!saved) return;
      id = saved;
    }
    await linkEnf.mutateAsync({ closure_id: id!, create_new: createNew, enforcement_type: enforcementType });
  };

  const printMemo = () => {
    if (!current) return;
    const det = DETERMINATIONS.find(d => d.value === current.determination_type)?.label ?? current.determination_type;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Investigation closure memorandum</title>
      <style>
        body{font-family:Georgia,serif;margin:40px;color:#111;line-height:1.5}
        h1{font-size:20px;margin-bottom:4px} h2{font-size:14px;margin-top:24px;text-transform:uppercase;letter-spacing:.06em}
        .meta{font-size:12px;color:#444;margin-bottom:20px}
        p{white-space:pre-wrap;font-size:13px} table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}
        td,th{border:1px solid #bbb;padding:6px;text-align:left}
      </style></head><body>
      <h1>Investigation Closure Memorandum</h1>
      <div class="meta">
        Investigation: ${investigation?.code ?? investigation?.id ?? ''}<br/>
        Entity: ${investigation?.licensees?.name ?? '—'}<br/>
        Determination: ${det}<br/>
        Version: ${current.version} · Status: ${current.status}<br/>
        ${current.approved_at ? `Approved at: ${new Date(current.approved_at).toLocaleString()}` : ''}
      </div>
      <h2>Allegation</h2><p>${investigation?.allegation ?? ''}</p>
      <h2>Summary of findings</h2><p>${current.findings_summary ?? '—'}</p>
      ${breaches.length ? `<h2>Substantiated breaches</h2><table><tr><th>Provision</th><th>Severity</th><th>Description</th></tr>
        ${breaches.map(b => `<tr><td>${b.provision}</td><td>${b.severity}</td><td>${b.description ?? ''}</td></tr>`).join('')}</table>` : ''}
      <h2>Evidence relied upon</h2><p>${current.evidence_relied_upon ?? '—'}</p>
      <h2>Determination rationale</h2><p>${current.rationale ?? '—'}</p>
      ${current.discontinuation_ground ? `<h2>Discontinuation ground</h2><p>${current.discontinuation_ground}${current.discontinuation_detail ? ` — ${current.discontinuation_detail}` : ''}</p>` : ''}
      ${current.enforcement_action_id ? `<h2>Enforcement referral</h2><p>Enforcement case ${current.enforcement_action_id}</p>` : ''}
      <h2>Next steps</h2><p>${current.next_steps ?? '—'}</p>
      <h2>Regulatory learning</h2><p>${current.regulatory_learning ?? '—'}</p>
      ${current.override_reason ? `<h2>Override</h2><p>${current.override_reason}</p>` : ''}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print the memorandum'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  if (isLoading) {
    return <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="h-4 w-4" />Closure determination
              {current && (
                <Badge variant={STATUS_TONE[current.status]} className="capitalize ml-1">
                  {current.status.replace(/_/g, ' ')}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              A supervisor must approve the determination before the investigation is concluded.
            </p>
          </div>
          <div className="flex gap-2">
            {current && <Button size="sm" variant="outline" onClick={printMemo}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {current?.status === 'rejected' && current.rejection_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <span className="font-medium">Returned by the approver:</span> {current.rejection_reason}
            </div>
          )}

          {!!blockers.length && !approved && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Readiness checks</div>
              <ul className="list-disc pl-5 text-xs">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Determination <span className="text-destructive">*</span></Label>
              <Select value={determination} onValueChange={v => setDetermination(v as DeterminationType)} disabled={!editable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DETERMINATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {DETERMINATIONS.find(d => d.value === determination)?.help}
              </p>
            </div>
            <div>
              <Label>Approver</Label>
              <Select value={approverId} onValueChange={setApproverId} disabled={!editable}>
                <SelectTrigger><SelectValue placeholder="Any supervisor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any supervisor</SelectItem>
                  {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {determination === 'discontinuation' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Discontinuation ground <span className="text-destructive">*</span></Label>
                <Select value={ground} onValueChange={setGround} disabled={!editable}>
                  <SelectTrigger><SelectValue placeholder="Select a ground" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a ground</SelectItem>
                    {DISCONTINUATION_GROUNDS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ground detail {ground === 'other' && <span className="text-destructive">*</span>}</Label>
                <Textarea rows={2} value={groundDetail} disabled={!editable}
                  onChange={e => setGroundDetail(e.target.value)} />
              </div>
            </div>
          )}

          {determination === 'closure_with_enforcement' && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4" />Enforcement referral
                {current?.enforcement_action_id
                  ? <Badge variant="default" className="ml-1">Linked</Badge>
                  : <Badge variant="outline" className="ml-1">Required</Badge>}
              </div>
              {current?.enforcement_action_id ? (
                <p className="text-xs font-mono text-muted-foreground">{current.enforcement_action_id}</p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-56">
                    <Label className="text-xs">Enforcement type</Label>
                    <Select value={enforcementType} onValueChange={setEnforcementType} disabled={!editable}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ENFORCEMENT_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button data-rbac="market_conduct.edit" size="sm" variant="outline" disabled={!editable || linkEnf.isPending}
                    onClick={() => onReferEnforcement(true)}>
                    Open enforcement case from this investigation
                  </Button>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Summary of findings <span className="text-destructive">*</span> <span className="text-xs text-muted-foreground">(min 20 characters)</span></Label>
            <Textarea rows={4} value={findings} disabled={!editable} onChange={e => setFindings(e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Evidence relied upon</Label>
              <Textarea rows={3} value={evidence} disabled={!editable} onChange={e => setEvidence(e.target.value)} />
            </div>
            <div>
              <Label>Determination rationale <span className="text-destructive">*</span> <span className="text-xs text-muted-foreground">(min 20 characters)</span></Label>
              <Textarea rows={3} value={rationale} disabled={!editable} onChange={e => setRationale(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Recommended next steps</Label>
              <Textarea rows={3} value={nextSteps} disabled={!editable} onChange={e => setNextSteps(e.target.value)} />
            </div>
            <div>
              <Label>Regulatory learning</Label>
              <Textarea rows={3} value={learning} disabled={!editable} onChange={e => setLearning(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="entity-letter" checked={letter} disabled={!editable}
              onCheckedChange={v => setLetter(!!v)} />
            <Label htmlFor="entity-letter" className="text-sm font-normal">
              Notification letter to the entity required
            </Label>
          </div>

          <Separator />

          {editable && !!submitMissing.length && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="font-medium text-xs">What's still needed before you can submit</div>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {submitMissing.map(m => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {editable && (
              <>
                <Button data-rbac="market_conduct.edit" size="sm" variant="outline"
                  onClick={persist} disabled={saveDraft.isPending}>
                  <Save className="h-4 w-4 mr-1" />Save draft
                </Button>
                <Button data-rbac="market_conduct.edit" size="sm" onClick={onSubmit}
                  title={submitMissing[0] ?? 'Submit the determination for approval'}
                  disabled={submit.isPending || saveDraft.isPending || submitMissing.length > 0}>
                  <Send className="h-4 w-4 mr-1" />Submit for approval
                </Button>
              </>
            )}

            {pending && (
              <>
                <Button data-rbac="market_conduct.approve" size="sm" variant="outline"
                  onClick={onReject} disabled={reject.isPending}>
                  <XCircle className="h-4 w-4 mr-1" />Return
                </Button>
                <Button data-rbac="market_conduct.approve" size="sm"
                  onClick={onApprove} disabled={approve.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />Approve
                </Button>
              </>
            )}
            {approved && (
              <span className="text-xs text-muted-foreground">
                Approved{current?.approved_at ? ` on ${new Date(current.approved_at).toLocaleString()}` : ''} — this record is locked.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <PostClosureMonitoringPanel investigationId={investigationId} closureId={current?.id ?? null} />

      {rows.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Determination history</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {rows.slice(1).map(c => (
              <div key={c.id} className="flex items-center justify-between border-b pb-1">
                <span>v{c.version} · {c.determination_type.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={STATUS_TONE[c.status]} className="capitalize">{c.status.replace(/_/g, ' ')}</Badge>
                  {new Date(c.updated_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
