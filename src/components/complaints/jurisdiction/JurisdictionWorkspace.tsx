/**
 * Jurisdiction assessment workspace (MC-02).
 *
 * The officer decides whether the complaint is something this authority can
 * deal with, BEFORE any supervisory triage is confirmed. Everything shown here
 * comes from one read model (`public.get_complaint_jurisdiction`) and every
 * write goes through a governed RPC:
 *
 *   complaint_jurisdiction_start                -> open the assessment
 *   complaint_jurisdiction_save_factor          -> record one factor
 *   complaint_jurisdiction_request_information  -> pause for information
 *   complaint_jurisdiction_record_information_response
 *   complaint_jurisdiction_decide               -> decide the outcome
 *   complaint_jurisdiction_reopen               -> reopen a decided assessment
 *
 * No timing target is displayed unless the backend reports one as configured,
 * and configured targets are labelled with their basis (operational default vs
 * regulator-approved) so nothing reads as a statutory deadline it is not.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime } from '@/lib/datetime';
import { respondentMatchStateLabel } from '@/lib/complaints/respondentMatchState';

import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Loader2, Scale } from 'lucide-react';

type FactorResult = 'YES' | 'NO' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'MORE_INFORMATION_REQUIRED';

const FACTOR_RESULTS: Array<{ value: FactorResult; label: string }> = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable' },
  { value: 'MORE_INFORMATION_REQUIRED', label: 'Need more information' },
  { value: 'UNKNOWN', label: 'Not assessed yet' },
];

const RESULT_TONE: Record<string, string> = {
  YES: 'default',
  NO: 'destructive',
  NOT_APPLICABLE: 'secondary',
  MORE_INFORMATION_REQUIRED: 'outline',
  UNKNOWN: 'outline',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_ASSESSMENT: 'Awaiting assessment',
  IN_ASSESSMENT: 'Assessment in progress',
  PENDING_INFORMATION: 'Waiting for information',
  DECIDED: 'Decision made',
};

const OUTCOME_LABEL: Record<string, string> = {
  ACCEPTED: 'Within our role',
  PARTIALLY_ACCEPTED: 'Partly within our role',
  REFERRED: 'Referred to another body',
  OUT_OF_JURISDICTION: 'Outside our role',
};




interface Props {
  complaintId: string;
  onJurisdictionDecided?: () => void;
}

export function JurisdictionWorkspace({ complaintId, onJurisdictionDecided }: Props) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['complaint-jurisdiction', complaintId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_complaint_jurisdiction', {
        _complaint_id: complaintId,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const data = q.data;
  const assessment = data?.assessment ?? null;
  const status: string = assessment?.status ?? 'PENDING_ASSESSMENT';
  const caps = data?.capabilities ?? {};
  const timing = data?.timing ?? {};
  const ruleSet = data?.effective_rule_set ?? null;
  const factors: any[] = data?.factors ?? [];
  const decided = status === 'DECIDED';

  const [factorDraft, setFactorDraft] = useState<Record<string, { result?: FactorResult; rationale?: string }>>({});
  const [infoText, setInfoText] = useState('');
  const [infoFrom, setInfoFrom] = useState('COMPLAINANT');
  const [infoDue, setInfoDue] = useState('');
  const [outcome, setOutcome] = useState<string>('ACCEPTED');
  const [rationale, setRationale] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [policyBasis, setPolicyBasis] = useState('');
  const [partialIn, setPartialIn] = useState('');
  const [partialOut, setPartialOut] = useState('');
  const [destName, setDestName] = useState('');
  const [destType, setDestType] = useState('OTHER');
  const [destContact, setDestContact] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [shareable, setShareable] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['complaint-jurisdiction', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint-triage', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint-intake-queue'] });
  };

  const rpc = (fn: string, args: Record<string, unknown>) => async () => {
    const { data: res, error } = await (supabase.rpc as any)(fn, args);
    if (error) throw error;
    return res;
  };

  const startMut = useMutation({
    mutationFn: rpc('complaint_jurisdiction_start', { _complaint_id: complaintId }),
    onSuccess: () => { toast.success('Jurisdiction assessment opened'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Could not open the assessment'),
  });

  const saveFactorMut = useMutation({
    mutationFn: async (vars: { code: string; result: FactorResult; rationale?: string }) => {
      const { data: res, error } = await (supabase.rpc as any)('complaint_jurisdiction_save_factor', {
        _complaint_id: complaintId,
        _factor_code: vars.code,
        _result: vars.result,
        _rationale: vars.rationale || null,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => { toast.success('Factor recorded'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Could not record the factor'),
  });

  const infoMut = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await (supabase.rpc as any)('complaint_jurisdiction_request_information', {
        _complaint_id: complaintId,
        _missing_information: infoText,
        _requested_from: infoFrom,
        _factor_codes: factors
          .filter((f) => f.result === 'MORE_INFORMATION_REQUIRED')
          .map((f) => f.factor_code),
        _due_date: infoDue || null,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => { toast.success('Information request recorded'); setInfoText(''); setInfoDue(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Could not record the request'),
  });

  const responseMut = useMutation({
    mutationFn: async (vars: { requestId: string; summary: string }) => {
      const { data: res, error } = await (supabase.rpc as any)('complaint_jurisdiction_record_information_response', {
        _request_id: vars.requestId,
        _response_summary: vars.summary,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => { toast.success('Response recorded'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Could not record the response'),
  });

  const decideMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        rationale,
        legal_basis: legalBasis || null,
        policy_basis: policyBasis || null,
      };
      if (outcome === 'PARTIALLY_ACCEPTED') {
        payload.partial_scope_summary = partialIn;
        payload.outside_scope_summary = partialOut;
      }
      if (outcome === 'REFERRED') {
        payload.destination_name = destName;
        payload.destination_type = destType;
        payload.destination_contact = destContact || null;
        payload.referral_reason = referralReason;
        payload.shareable_information = shareable;
      }
      const { data: res, error } = await (supabase.rpc as any)('complaint_jurisdiction_decide', {
        _complaint_id: complaintId,
        _outcome: outcome,
        _payload: payload,
        _expected_row_version: assessment?.row_version ?? null,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      toast.success('Jurisdiction decision recorded');
      setRationale(''); setLegalBasis(''); setPolicyBasis('');
      invalidate();
      onJurisdictionDecided?.();
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record the decision'),
  });

  const reopenMut = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await (supabase.rpc as any)('complaint_jurisdiction_reopen', {
        _complaint_id: complaintId, _reason: reopenReason,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => { toast.success('Assessment reopened'); setReopenReason(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Could not reopen the assessment'),
  });

  const mandatoryOutstanding = useMemo(
    () => factors.filter((f) => f.requirement === 'MANDATORY'
      && ['UNKNOWN', 'MORE_INFORMATION_REQUIRED'].includes(String(f.result))),
    [factors],
  );

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) {
    return <QueryErrorState message="Failed to load the jurisdiction assessment" onRetry={() => q.refetch()} />;
  }

  const openInfoRequests: any[] = (data?.information_requests ?? []).filter((r: any) => !r.responded_at);

  return (
    <div className="space-y-4">
      {/* ---------- Status header ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Is this something we can deal with?
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={decided ? 'default' : 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
              {assessment?.decision_outcome && (
                <Badge variant="secondary">{OUTCOME_LABEL[assessment.decision_outcome] ?? assessment.decision_outcome}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Respondent</p>
              {(data?.respondents ?? []).length === 0 ? <p>—</p> : (data.respondents as any[]).map((r) => (
                <p key={r.id} className="text-sm">
                  {r.legal_name}
                  {r.trading_name ? ` (${r.trading_name})` : ''}
                  <span className="block text-xs text-muted-foreground">
                    {MATCH_STATE_LABEL[r.match_state] ?? r.match_state ?? 'Match state not recorded'}
                  </span>
                </p>
              ))}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Product / channel</p>
              <p>{data?.complaint?.product_name || 'Not recorded'}</p>
              <p className="text-xs text-muted-foreground">{data?.complaint?.channel_name || 'Channel not recorded'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Received / incident date</p>
              <p>{formatDateTime(data?.complaint?.received_at)}</p>
              <p className="text-xs text-muted-foreground">
                Incident: {data?.complaint?.incident_date || 'not recorded'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Timing: only shown when configured, always labelled with its basis */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {timing?.target_configured ? (
              <>
                <span>
                  Working target: <strong>{timing.target_days} days</strong> from receipt
                  {timing.target_date ? ` (by ${timing.target_date})` : ''}
                </span>
                <Badge variant={timing.overdue ? 'destructive' : 'outline'}>
                  {timing.overdue ? 'Past the working target' : 'Within the working target'}
                </Badge>
                <Badge variant="secondary">
                  {timing?.config?.statutory
                    ? 'Statutory deadline'
                    : timing?.config?.is_platform_template
                      ? 'Platform operational default — not a statutory deadline'
                      : 'Configured operational target'}
                </Badge>
              </>
            ) : (
              <span className="text-muted-foreground">
                No assessment time target is configured for this authority, so no deadline is shown.
              </span>
            )}
          </div>

          {ruleSet && (
            <p className="text-xs text-muted-foreground">
              Rules applied: {ruleSet.name} v{ruleSet.version}
              {ruleSet.pinned ? ' (pinned to this assessment)' : ' (currently in effect)'}
              {ruleSet.is_platform_template ? ' — platform configuration template, not regulator-approved policy' : ''}
            </p>
          )}

          {status === 'PENDING_ASSESSMENT' && (
            <div className="rounded-md border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Open the assessment to record each jurisdiction factor against the rules in effect.
              </p>
              <Button size="sm" disabled={!caps.can_assess || startMut.isPending}
                      onClick={() => startMut.mutate()} data-rbac="complaint_management.assess_jurisdiction">
                {startMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start assessment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Support needs declared at intake ---------- */}
      {data?.support_needs?.support_required && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />Support needs declared at intake
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Staff review: <strong>{String(data.support_needs.staff_review_state ?? 'pending')}</strong></p>
            {data.support_needs.consumer_notes && (
              <p className="text-muted-foreground whitespace-pre-wrap">{data.support_needs.consumer_notes}</p>
            )}
            {data.support_needs.handling_instruction && (
              <p>Handling instruction: {data.support_needs.handling_instruction}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- Factors ---------- */}
      {assessment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jurisdiction factors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {factors.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The rules in effect define no factors for this assessment.
              </p>
            )}
            {factors.map((f) => {
              const draft = factorDraft[f.factor_code] ?? {};
              const current = (draft.result ?? f.result ?? 'UNKNOWN') as FactorResult;
              return (
                <div key={f.factor_code} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{f.factor_label}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" />{f.guidance}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.requirement === 'MANDATORY' ? 'default' : 'secondary'}>
                        {f.requirement === 'MANDATORY' ? 'Must be resolved' : 'Supporting'}
                      </Badge>
                      <Badge variant={(RESULT_TONE[String(f.result)] ?? 'outline') as any}>
                        {FACTOR_RESULTS.find((r) => r.value === f.result)?.label ?? 'Not assessed yet'}
                      </Badge>
                    </div>
                  </div>

                  {!decided && caps.can_assess && (
                    <div className="grid gap-2 md:grid-cols-[200px,1fr,auto] md:items-end">
                      <div>
                        <Label className="text-xs">Finding</Label>
                        <Select
                          value={current}
                          onValueChange={(v) => setFactorDraft((s) => ({
                            ...s, [f.factor_code]: { ...s[f.factor_code], result: v as FactorResult },
                          }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FACTOR_RESULTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Reasoning (recorded on the case)</Label>
                        <Textarea
                          rows={2}
                          value={draft.rationale ?? f.rationale ?? ''}
                          placeholder="Why this finding, and what you relied on"
                          onChange={(e) => setFactorDraft((s) => ({
                            ...s, [f.factor_code]: { ...s[f.factor_code], rationale: e.target.value },
                          }))}
                        />
                      </div>
                      <Button
                        size="sm"
                        data-rbac="complaint_management.assess_jurisdiction"
                        disabled={saveFactorMut.isPending}
                        onClick={() => saveFactorMut.mutate({
                          code: f.factor_code,
                          result: current,
                          rationale: draft.rationale ?? f.rationale ?? undefined,
                        })}
                      >
                        Save
                      </Button>
                    </div>
                  )}

                  {f.evaluated_at && (
                    <p className="text-xs text-muted-foreground">Last recorded {formatDateTime(f.evaluated_at)}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ---------- Information requests ---------- */}
      {assessment && !decided && caps.can_assess && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ask for more information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Use this when a factor cannot be resolved yet. The assessment moves to
              <strong> waiting for information</strong> until a response is recorded.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Ask</Label>
                <Select value={infoFrom} onValueChange={setInfoFrom}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLAINANT">The complainant</SelectItem>
                    <SelectItem value="RESPONDENT">The firm complained about</SelectItem>
                    <SelectItem value="THIRD_PARTY">A third party</SelectItem>
                    <SelectItem value="INTERNAL">Internal colleague</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  Reply by {data?.timing?.config?.information_request_days
                    ? `(default ${data.timing.config.information_request_days} days)`
                    : '(no configured target)'}
                </Label>
                <Input type="date" value={infoDue} onChange={(e) => setInfoDue(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">What is missing</Label>
              <Textarea rows={3} value={infoText} onChange={(e) => setInfoText(e.target.value)}
                        placeholder="Describe exactly what is needed to resolve the outstanding factors" />
            </div>
            <Button size="sm" data-rbac="complaint_management.assess_jurisdiction"
                    disabled={infoText.trim().length < 10 || infoMut.isPending}
                    onClick={() => infoMut.mutate()}>
              {infoMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record information request
            </Button>
          </CardContent>
        </Card>
      )}

      {openInfoRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Outstanding information requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {openInfoRequests.map((r) => (
              <OpenInfoRequest key={r.id} request={r}
                               canRespond={!!caps.can_assess}
                               pending={responseMut.isPending}
                               onRespond={(summary) => responseMut.mutate({ requestId: r.id, summary })} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---------- Decision ---------- */}
      {assessment && !decided && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Record the jurisdiction decision</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mandatoryOutstanding.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <p className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />Outstanding factors that must be resolved first
                </p>
                <ul className="list-disc pl-5 mt-1">
                  {mandatoryOutstanding.map((f) => <li key={f.factor_code}>{f.factor_label}</li>)}
                </ul>
                <p className="mt-1 text-muted-foreground">
                  These block "within our role" and "partly within our role" only. A referral or an
                  outside-our-role decision can still be recorded.
                </p>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Decision</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCEPTED">Within our role</SelectItem>
                    <SelectItem value="PARTIALLY_ACCEPTED">Partly within our role</SelectItem>
                    <SelectItem value="REFERRED">Refer to another body</SelectItem>
                    <SelectItem value="OUT_OF_JURISDICTION">Outside our role</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Legal basis (if any)</Label>
                <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)}
                       placeholder="Only if a specific provision applies" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Policy basis (if any)</Label>
              <Input value={policyBasis} onChange={(e) => setPolicyBasis(e.target.value)}
                     placeholder="Named internal policy, if relied on" />
            </div>

            {outcome === 'PARTIALLY_ACCEPTED' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">The part within our role</Label>
                  <Textarea rows={3} value={partialIn} onChange={(e) => setPartialIn(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">The part outside our role</Label>
                  <Textarea rows={3} value={partialOut} onChange={(e) => setPartialOut(e.target.value)} />
                </div>
              </div>
            )}

            {outcome === 'REFERRED' && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">Destination type</Label>
                    <Select value={destType} onValueChange={setDestType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REGULATOR">Another regulator</SelectItem>
                        <SelectItem value="OMBUDSMAN">Ombudsman</SelectItem>
                        <SelectItem value="LAW_ENFORCEMENT">Law enforcement</SelectItem>
                        <SelectItem value="COURT">Court or tribunal</SelectItem>
                        <SelectItem value="OTHER">Other body</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Destination name</Label>
                    <Input value={destName} onChange={(e) => setDestName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Destination contact (optional)</Label>
                  <Input value={destContact} onChange={(e) => setDestContact(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Why we are referring</Label>
                  <Textarea rows={2} value={referralReason} onChange={(e) => setReferralReason(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">What information may be shared</Label>
                  <Textarea rows={2} value={shareable} onChange={(e) => setShareable(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Reasoning (at least 10 characters, recorded on the case)</Label>
              <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-rbac="complaint_management.decide_jurisdiction"
                disabled={!caps.can_decide || rationale.trim().length < 10 || decideMut.isPending}
                onClick={() => decideMut.mutate()}
              >
                {decideMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record decision
              </Button>
              {!caps.can_decide && (
                <p className="text-xs text-muted-foreground">
                  You can record findings, but deciding jurisdiction needs the decide authority.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Decided summary ---------- */}
      {decided && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />Decision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Outcome</p>
                <p>{OUTCOME_LABEL[assessment.decision_outcome] ?? assessment.decision_outcome}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Decided</p>
                <p>{formatDateTime(assessment.decision_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rules version</p>
                <p>v{assessment.rule_set_version ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reasoning</p>
              <p className="whitespace-pre-wrap">{assessment.rationale}</p>
            </div>
            {assessment.partial_scope_summary && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Within our role</p>
                  <p className="whitespace-pre-wrap">{assessment.partial_scope_summary}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outside our role</p>
                  <p className="whitespace-pre-wrap">{assessment.outside_scope_summary}</p>
                </div>
              </div>
            )}
            {(data?.referrals ?? []).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Referrals</p>
                {(data.referrals as any[]).map((r) => (
                  <p key={r.id}>{r.destination_name} — {r.status}</p>
                ))}
              </div>
            )}

            {caps.can_reopen && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs">Reopen this assessment (recorded with a reason)</Label>
                <Textarea rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                <Button size="sm" variant="outline"
                        data-rbac="complaint_management.reopen_jurisdiction"
                        disabled={reopenReason.trim().length < 10 || reopenMut.isPending}
                        onClick={() => reopenMut.mutate()}>
                  Reopen assessment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OpenInfoRequest({ request, canRespond, pending, onRespond }: {
  request: any; canRespond: boolean; pending: boolean; onRespond: (summary: string) => void;
}) {
  const [summary, setSummary] = useState('');
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Asked of: {String(request.requested_from || '').toLowerCase()}</p>
        <Badge variant="outline">
          {request.due_date ? `Reply by ${request.due_date}` : 'No reply date set'}
        </Badge>
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">{request.missing_information}</p>
      {canRespond && (
        <div className="space-y-2">
          <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)}
                    placeholder="Summarise the response received" />
          <Button size="sm" variant="outline" disabled={summary.trim().length < 5 || pending}
                  onClick={() => { onRespond(summary); setSummary(''); }}>
            Record response
          </Button>
        </div>
      )}
    </div>
  );
}

export default JurisdictionWorkspace;
