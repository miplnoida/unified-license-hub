/**
 * Risk-based triage panel (MC-02).
 *
 * Two clearly separated things:
 *
 *  1. AUTOMATED RECOMMENDATION — produced by the triage engine from an
 *     immutable published rule version. It is never a decision. It can be
 *     accepted as-is or changed.
 *  2. CONFIRMED SUPERVISORY TRIAGE — the human decision recorded by
 *     `public.complaint_triage_confirm`. Changing the recommendation requires
 *     override authority and a written reason; confirming a systemic issue is
 *     always an explicit human act.
 *
 * The four dimensions are independent: consumer harm, case priority, conduct
 * risk and systemic potential. Triage can only be confirmed once jurisdiction
 * is decided as within, or partly within, our role — the server enforces this
 * and the panel reflects it.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime } from '@/lib/datetime';
import { AlertTriangle, Bot, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

const HARM = [
  { value: 'LOW', label: 'Low — little or no detriment' },
  { value: 'MODERATE', label: 'Moderate — real but contained detriment' },
  { value: 'HIGH', label: 'High — significant detriment' },
  { value: 'SEVERE', label: 'Severe — serious or irreversible detriment' },
];
const PRIORITY = [
  { value: 'p1', label: 'P1 — handle immediately' },
  { value: 'p2', label: 'P2 — handle ahead of routine work' },
  { value: 'p3', label: 'P3 — routine' },
  { value: 'p4', label: 'P4 — monitor only' },
];
const RISK = [
  { value: 'LOW', label: 'Low conduct risk' },
  { value: 'MODERATE', label: 'Moderate conduct risk' },
  { value: 'HIGH', label: 'High conduct risk' },
  { value: 'CRITICAL', label: 'Critical conduct risk' },
];
const SYSTEMIC = [
  { value: 'INDIVIDUAL', label: 'Individual matter' },
  { value: 'RECURRING', label: 'Recurring pattern' },
  { value: 'POTENTIAL_SYSTEMIC', label: 'Potentially systemic' },
  { value: 'CONFIRMED_SYSTEMIC', label: 'Confirmed systemic (human decision only)' },
];

const labelOf = (list: Array<{ value: string; label: string }>, v?: string | null) =>
  list.find((x) => x.value === v)?.label ?? (v ? String(v) : 'Not set');

interface Props {
  complaintId: string;
  onOpenJurisdiction?: () => void;
}

export function TriagePanel({ complaintId, onOpenJurisdiction }: Props) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['complaint-triage', complaintId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_complaint_triage', {
        _complaint_id: complaintId,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const d = q.data;
  const rec = d?.recommendation ?? null;
  const cur = d?.current ?? {};
  const caps = d?.capabilities ?? {};
  const jur = d?.jurisdiction ?? {};
  const gateOpen = !!jur.triage_allowed;
  const confirmed = ['CONFIRMED', 'OVERRIDDEN'].includes(String(cur.confirmation_status));

  const [harm, setHarm] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [risk, setRisk] = useState<string>('');
  const [systemic, setSystemic] = useState<string>('');
  const [slaDays, setSlaDays] = useState<string>('');
  const [reason, setReason] = useState('');

  // Seed the form from the recommendation, falling back to what is on the case.
  useEffect(() => {
    if (!d) return;
    setHarm((prev) => prev || rec?.consumer_harm || cur.consumer_harm || '');
    setPriority((prev) => prev || rec?.priority || cur.priority || '');
    setRisk((prev) => prev || rec?.conduct_risk_level || cur.conduct_risk_level || '');
    setSystemic((prev) => prev || rec?.systemic_potential || cur.systemic_potential || '');
    setSlaDays((prev) => prev || (rec?.sla_days ?? cur.sla_days ?? '').toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.complaint_id, rec?.id]);

  const changesRecommendation =
    (!!harm && rec?.consumer_harm && harm !== rec.consumer_harm) ||
    (!!priority && rec?.priority && priority !== rec.priority) ||
    (!!risk && rec?.conduct_risk_level && risk !== rec.conduct_risk_level) ||
    (!!systemic && rec?.systemic_potential && systemic !== rec.systemic_potential) ||
    systemic === 'CONFIRMED_SYSTEMIC';

  const reEvaluate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('evaluate-complaint-triage', {
        body: { complaint_id: complaintId, triggered_by: 'manual_retry' },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Triage engine failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Recommendation refreshed');
      qc.invalidateQueries({ queryKey: ['complaint-triage', complaintId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not refresh the recommendation'),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)('complaint_triage_confirm', {
        _complaint_id: complaintId,
        _payload: {
          consumer_harm: harm || null,
          priority: priority || null,
          conduct_risk_level: risk || null,
          systemic_potential: systemic || null,
          sla_days: slaDays ? Number(slaDays) : null,
          override_reason: reason || null,
        },
        _expected_updated_at: d?.updated_at ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res?.status === 'OVERRIDDEN' ? 'Triage recorded as an override' : 'Triage confirmed');
      setReason('');
      qc.invalidateQueries({ queryKey: ['complaint-triage', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint-intake-queue'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record triage'),
  });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <QueryErrorState message="Failed to load triage" onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      {/* Lifecycle gate */}
      {!gateOpen && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 text-sm flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />Jurisdiction must be decided first
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Triage can only be confirmed once the complaint is decided as within, or partly within,
                our role. Current jurisdiction state: {String(jur.status ?? 'awaiting assessment')
                  .toLowerCase().replace(/_/g, ' ')}.
              </p>
            </div>
            {onOpenJurisdiction && (
              <Button size="sm" variant="outline" onClick={onOpenJurisdiction}>Open jurisdiction assessment</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Automated recommendation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />Automated recommendation
            </CardTitle>
            <Button size="sm" variant="outline" disabled={reEvaluate.isPending}
                    data-rbac="complaint_management.retry_triage"
                    onClick={() => reEvaluate.mutate()}>
              {reEvaluate.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-run
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!rec ? (
            <p className="text-muted-foreground">
              No automated recommendation has been produced for this complaint yet.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Dim label="Consumer harm" value={labelOf(HARM, rec.consumer_harm)} />
                <Dim label="Case priority" value={labelOf(PRIORITY, rec.priority)} />
                <Dim label="Conduct risk" value={labelOf(RISK, rec.conduct_risk_level)} />
                <Dim label="Systemic potential" value={labelOf(SYSTEMIC, rec.systemic_potential)} />
              </div>
              <p className="text-xs text-muted-foreground">
                {rec.rule_name
                  ? `Rule: ${rec.rule_name}${rec.rule_version ? ` v${rec.rule_version}` : ''}`
                  : 'No rule matched — the dimensions below are for the officer to set.'}
                {' · '}Produced {formatDateTime(rec.evaluated_at)} · recommendation only, not a decision
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmed supervisory triage */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />Confirmed supervisory triage
            </CardTitle>
            <Badge variant={confirmed ? 'default' : 'outline'}>
              {cur.confirmation_status === 'OVERRIDDEN' ? 'Confirmed with changes'
                : cur.confirmation_status === 'CONFIRMED' ? 'Confirmed'
                : 'Awaiting confirmation'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <Dim label="Consumer harm" value={labelOf(HARM, cur.consumer_harm)} />
            <Dim label="Case priority" value={labelOf(PRIORITY, cur.priority)} />
            <Dim label="Conduct risk" value={labelOf(RISK, cur.conduct_risk_level)} />
            <Dim label="Systemic potential" value={labelOf(SYSTEMIC, cur.systemic_potential)} />
          </div>
          {confirmed && (
            <p className="text-xs text-muted-foreground">
              Confirmed by {cur.confirmed_by_name || 'a supervisor'} on {formatDateTime(cur.confirmed_at)}
              {cur.override_reason ? ` · reason: ${cur.override_reason}` : ''}
            </p>
          )}

          <Separator />

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Consumer harm</Label>
              <Select value={harm} onValueChange={setHarm} disabled={!caps.can_triage || !gateOpen}>
                <SelectTrigger><SelectValue placeholder="Select harm level" /></SelectTrigger>
                <SelectContent>
                  {HARM.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Case priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={!caps.can_triage || !gateOpen}>
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Conduct risk</Label>
              <Select value={risk} onValueChange={setRisk} disabled={!caps.can_triage || !gateOpen}>
                <SelectTrigger><SelectValue placeholder="Select conduct risk" /></SelectTrigger>
                <SelectContent>
                  {RISK.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Systemic potential</Label>
              <Select value={systemic} onValueChange={setSystemic} disabled={!caps.can_triage || !gateOpen}>
                <SelectTrigger><SelectValue placeholder="Select systemic potential" /></SelectTrigger>
                <SelectContent>
                  {SYSTEMIC.map((o) => (
                    <SelectItem key={o.value} value={o.value}
                                disabled={o.value === 'CONFIRMED_SYSTEMIC' && !caps.can_override}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Handling days (optional)</Label>
              <Input type="number" min={1} value={slaDays}
                     disabled={!caps.can_triage || !gateOpen}
                     onChange={(e) => setSlaDays(e.target.value)} />
            </div>
          </div>

          {changesRecommendation && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs">
                You are changing the automated recommendation
                {systemic === 'CONFIRMED_SYSTEMIC' ? ' and confirming a systemic issue' : ''}.
                This is recorded as a supervisory override and needs a written reason.
              </p>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="Why the supervisory judgement differs (at least 10 characters)" />
              {!caps.can_override && (
                <p className="text-xs text-destructive">
                  Changing the recommendation needs triage override authority.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-rbac="complaint_management.triage"
              disabled={
                !caps.can_triage || !gateOpen || confirm.isPending ||
                (changesRecommendation && (!caps.can_override || reason.trim().length < 10))
              }
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {changesRecommendation ? 'Confirm with changes' : 'Accept and confirm'}
            </Button>
            {!rec && caps.can_triage && gateOpen && !confirmed && (
              <p className="text-xs text-muted-foreground">
                First supervisory confirmation — no automated recommendation to depart from.
              </p>
            )}
            {!caps.can_triage && (
              <p className="text-xs text-muted-foreground">You do not have triage authority on this complaint.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Triage history</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(d?.history ?? []).length === 0 && (
            <p className="text-muted-foreground">No triage evaluations recorded yet.</p>
          )}
          {(d?.history ?? []).map((h: any) => (
            <div key={h.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {h.source === 'auto' || h.source === 'auto_retry'
                    ? `Automated recommendation${h.rule_version ? ` (rule v${h.rule_version})` : ''}`
                    : h.source === 'manual_override' ? 'Supervisory override' : 'Supervisory confirmation'}
                </p>
                <span className="text-xs text-muted-foreground">{formatDateTime(h.evaluated_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {labelOf(HARM, h.consumer_harm)} · {labelOf(PRIORITY, h.priority)} · {labelOf(RISK, h.conduct_risk_level)} · {labelOf(SYSTEMIC, h.systemic_potential)}
                {h.evaluated_by_name ? ` · ${h.evaluated_by_name}` : ''}
              </p>
              {h.override_reason && <p className="text-xs mt-1">Reason: {h.override_reason}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Dim({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}

export default TriagePanel;
