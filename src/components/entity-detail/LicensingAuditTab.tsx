import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Gavel, ShieldAlert, GitBranch, CheckCircle2, AlertTriangle, Sparkles, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { logAction } from '@/hooks/useAuditLog';

interface Props {
  entityId: string;
  onOpenSupervisoryTab?: () => void;
}

type TraceItem = {
  kind: 'risk' | 'judgement' | 'conflict' | 'resolution';
  title: string;
  subtitle?: string;
  detail?: string;
  at: string;
  status?: string;
};

type Determination = {
  id: string;
  verdict: string;
  rationale: string;
  effective_date: string;
  issued_by: string;
  issued_at: string;
  risk_rating_id: string | null;
};

type RiskProfile = {
  id: string;
  profile_score: number;
  tier: 'low' | 'medium' | 'high' | 'critical';
  key_drivers: any[];
  snapshot: any;
  generated_at: string;
};

const verdictLabel: Record<string, string> = {
  approve: 'Approve',
  approve_with_conditions: 'Approve with conditions',
  refer: 'Refer',
  refuse: 'Refuse',
};

const tierTone: Record<RiskProfile['tier'], string> = {
  low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

const kindIcon = {
  risk: ShieldAlert,
  judgement: Gavel,
  conflict: GitBranch,
  resolution: CheckCircle2,
} as const;

export default function LicensingAuditTab({ entityId, onOpenSupervisoryTab }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [determinations, setDeterminations] = useState<Determination[]>([]);
  const [profiles, setProfiles] = useState<RiskProfile[]>([]);
  const [latestRiskRatingId, setLatestRiskRatingId] = useState<string | null>(null);
  const [rawInputs, setRawInputs] = useState<any>({});

  // form state
  const [verdict, setVerdict] = useState<string>('approve');
  const [rationale, setRationale] = useState('');
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [issuing, setIssuing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const [riskRes, enfRes, flagsRes, escRes, detRes, profRes] = await Promise.all([
        supabase.from('risk_ratings').select('id, overall_rating, risk_score, assessment_date, notes, created_at').eq('entity_id', entityId).order('assessment_date', { ascending: false }).limit(10),
        supabase.from('enforcement_actions' as any).select('id, case_number, enforcement_type, status, date_opened, decision_outcome, decision_at, decision_rationale, resolution_date').eq('entity_id', entityId).order('date_opened', { ascending: false }).limit(10),
        supabase.from('coordination_flags' as any).select('id, title, flag_type, status, created_at, resolved_at, description').or(`linked_license_id.eq.${entityId},linked_application_id.eq.${entityId}`).order('created_at', { ascending: false }).limit(10),
        supabase.from('coordination_escalations' as any).select('id, reason, status, resolution_notes, created_at, resolved_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('licensing_audit_determinations' as any).select('*').eq('entity_id', entityId).order('issued_at', { ascending: false }),
        supabase.from('licensing_audit_risk_profiles' as any).select('*').eq('entity_id', entityId).order('generated_at', { ascending: false }),
      ]);

      const risks = (riskRes.data || []) as any[];
      const enf = (enfRes.data || []) as any[];
      const flags = (flagsRes.data || []) as any[];
      const escalations = (escRes.data || []) as any[];

      setLatestRiskRatingId(risks[0]?.id || null);
      setRawInputs({ risks, enf, flags, escalations });

      const items: TraceItem[] = [];
      risks.forEach((r) => items.push({
        kind: 'risk',
        title: `Risk rating: ${r.overall_rating}`,
        subtitle: `Score ${r.risk_score}`,
        detail: r.notes || undefined,
        at: r.assessment_date || r.created_at,
      }));
      enf.filter((e) => e.decision_at || e.decision_outcome).forEach((e) => items.push({
        kind: 'judgement',
        title: `Enforcement ${e.case_number}: ${e.decision_outcome || e.enforcement_type}`,
        subtitle: e.enforcement_type,
        detail: e.decision_rationale || undefined,
        at: e.decision_at || e.date_opened,
        status: e.status,
      }));
      flags.forEach((f) => {
        const isResolved = !!f.resolved_at || f.status === 'resolved' || f.status === 'closed';
        items.push({
          kind: isResolved ? 'resolution' : 'conflict',
          title: f.title || `Flag: ${f.flag_type}`,
          subtitle: f.flag_type,
          detail: f.description || undefined,
          at: f.resolved_at || f.created_at,
          status: f.status,
        });
      });
      escalations.filter((e) => e.resolved_at || e.resolution_notes).forEach((e) => items.push({
        kind: 'resolution',
        title: 'Escalation resolved',
        subtitle: e.reason || undefined,
        detail: e.resolution_notes || undefined,
        at: e.resolved_at || e.created_at,
        status: e.status,
      }));

      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setTrace(items.slice(0, 40));
      setDeterminations((detRes.data || []) as any);
      setProfiles((profRes.data || []) as any);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load audit view');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  const latestProfile = profiles[0] || null;
  const latestDetermination = determinations[0] || null;
  const canAutoCreate = !!latestDetermination && !!latestProfile;

  const computeProfile = () => {
    const { risks = [], enf = [], flags = [] } = rawInputs;
    const drivers: { label: string; weight: number }[] = [];
    let score = 0;
    if (risks[0]) {
      const s = Number(risks[0].risk_score) || 0;
      score += Math.min(60, s);
      drivers.push({ label: `Latest risk rating (${risks[0].overall_rating})`, weight: Math.min(60, s) });
    }
    const openEnf = enf.filter((e: any) => e.status && !['closed', 'resolved'].includes(String(e.status).toLowerCase())).length;
    if (openEnf) {
      score += openEnf * 8;
      drivers.push({ label: `${openEnf} open enforcement action${openEnf > 1 ? 's' : ''}`, weight: openEnf * 8 });
    }
    const openFlags = flags.filter((f: any) => !f.resolved_at && !['closed', 'resolved'].includes(String(f.status).toLowerCase())).length;
    if (openFlags) {
      score += openFlags * 5;
      drivers.push({ label: `${openFlags} open coordination flag${openFlags > 1 ? 's' : ''}`, weight: openFlags * 5 });
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const tier: RiskProfile['tier'] = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
    return { profile_score: score, tier, key_drivers: drivers };
  };

  const issueDetermination = async () => {
    if (!user?.id || !rationale.trim()) {
      toast.error('Rationale is required');
      return;
    }
    setIssuing(true);
    try {
      const { error } = await (supabase as any).rpc('licensing_audit_record_determination', {
        _entity_id: entityId,
        _verdict: verdict,
        _rationale: rationale.trim(),
        _effective_date: effectiveDate,
        _risk_rating_id: latestRiskRatingId,
      });
      if (error) throw error;
      // Authoritative audit event is written by the governed operation.
      toast.success('Final determination issued');
      setRationale('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to issue determination');
    } finally {
      setIssuing(false);
    }
  };

  const generateProfile = async () => {
    if (!user?.id) return;
    setGenerating(true);
    try {
      const computed = computeProfile();
      const { error } = await (supabase as any).rpc('licensing_audit_record_risk_profile', {
        _entity_id: entityId,
        _profile_score: computed.profile_score,
        _tier: computed.tier,
        _key_drivers: computed.key_drivers,
        _snapshot: {
          risk_ratings: (rawInputs.risks || []).slice(0, 3),
          open_enforcement_count: (rawInputs.enf || []).filter((e: any) => !['closed', 'resolved'].includes(String(e.status || '').toLowerCase())).length,
          open_flags_count: (rawInputs.flags || []).filter((f: any) => !f.resolved_at).length,
        },
      });
      if (error) throw error;
      toast.success(`Risk profile generated: ${computed.tier.toUpperCase()} (${computed.profile_score})`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate profile');
    } finally {
      setGenerating(false);
    }
  };

  const actionTemplateForTier = (tier: RiskProfile['tier']) => {
    const today = new Date();
    const offset = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    if (tier === 'critical' || tier === 'high') {
      return [
        { title: 'Targeted on-site inspection', description: 'Focused inspection based on audit findings.', owner_role: 'supervisor', due_date: offset(30) },
        { title: 'Quarterly prudential review', description: 'Deep review of prudential returns and KPIs.', owner_role: 'analyst', due_date: offset(90) },
        { title: 'Review and update license conditions', description: 'Align conditions with the determination outcome.', owner_role: 'licensing_officer', due_date: offset(45) },
      ];
    }
    if (tier === 'medium') {
      return [
        { title: 'Semi-annual supervisory review', description: 'Standard supervisory review cycle.', owner_role: 'supervisor', due_date: offset(180) },
        { title: 'Verify corrective action closure', description: 'Confirm outstanding items are addressed.', owner_role: 'analyst', due_date: offset(60) },
      ];
    }
    return [
      { title: 'Annual supervisory review', description: 'Baseline supervisory monitoring.', owner_role: 'supervisor', due_date: offset(365) },
    ];
  };

  const autoCreatePlan = async () => {
    if (!user?.id || !latestProfile || !latestDetermination) return;
    setCreatingPlan(true);
    try {
      const { data: plan, error: planErr } = await supabase.from('supervisory_plans' as any).insert({
        entity_id: entityId,
        risk_rating_id: latestRiskRatingId,
        created_from: 'audit',
        status: 'draft',
        notes: `Auto-generated from Licensing Audit determination ${latestDetermination.id} (tier: ${latestProfile.tier}, score: ${latestProfile.profile_score}).`,
        created_by: user.id,
      }).select('id').single();
      if (planErr) throw planErr;
      const planId = (plan as any).id;
      const actions = actionTemplateForTier(latestProfile.tier).map((a) => ({
        plan_id: planId,
        title: a.title,
        description: a.description,
        owner_role: a.owner_role,
        due_date: a.due_date,
        status: 'open',
        source: 'audit',
      }));
      const { error: actErr } = await supabase.from('supervisory_plan_actions' as any).insert(actions);
      if (actErr) throw actErr;

      await logAction('licensee.audit.plan_auto_created', 'supervisory_plan', planId, {
        after: {
          determination_id: latestDetermination.id,
          risk_profile_id: latestProfile.id,
          action_count: actions.length,
        },
      });

      toast.success(`Initial supervisory plan created with ${actions.length} action${actions.length === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to auto-create supervisory plan');
    } finally {
      setCreatingPlan(false);
    }
  };

  const groupedTrace = useMemo(() => trace, [trace]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trace timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Licensing audit trace — Risk · Judgement · Conflict · Resolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {groupedTrace.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No traceable risk, judgement, conflict, or resolution records yet for this entity.
            </div>
          ) : (
            <ol className="relative border-l border-border pl-6 space-y-4">
              {groupedTrace.map((item, idx) => {
                const Icon = kindIcon[item.kind];
                return (
                  <li key={idx} className="relative">
                    <span className="absolute -left-[30px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted border">
                      <Icon className="h-3 w-3 text-foreground" />
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] uppercase">{item.kind}</Badge>
                          <span className="font-medium text-sm">{item.title}</span>
                          {item.status && (
                            <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
                          )}
                        </div>
                        {item.subtitle && <div className="text-xs text-muted-foreground">{item.subtitle}</div>}
                        {item.detail && <div className="text-xs mt-1 whitespace-pre-wrap">{item.detail}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.at ? formatDistanceToNow(new Date(item.at), { addSuffix: true }) : '—'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Final determination */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" />
            Issue final determination
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Verdict</Label>
              <Select value={verdict} onValueChange={setVerdict}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(verdictLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Effective date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="h-9" />
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              {latestRiskRatingId ? 'Linked to latest risk rating.' : 'No risk rating linked.'}
            </div>
          </div>
          <div>
            <Label className="text-xs">Rationale</Label>
            <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Basis for the determination" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" data-rbac="license_management.approve" onClick={issueDetermination} disabled={issuing || !rationale.trim()}>
              {issuing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Issue determination
            </Button>
          </div>

          {determinations.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">Prior determinations</div>
              <ul className="space-y-2">
                {determinations.map((d) => (
                  <li key={d.id} className="text-sm border rounded-md p-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{verdictLabel[d.verdict] || d.verdict}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Effective {new Date(d.effective_date).toLocaleDateString()} · issued {formatDistanceToNow(new Date(d.issued_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{d.rationale}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Supervisory risk profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              {latestProfile ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={tierTone[latestProfile.tier]}>{latestProfile.tier.toUpperCase()}</Badge>
                    <span className="text-2xl font-semibold tabular-nums">{latestProfile.profile_score}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      generated {formatDistanceToNow(new Date(latestProfile.generated_at), { addSuffix: true })}
                    </span>
                  </div>
                  {Array.isArray(latestProfile.key_drivers) && latestProfile.key_drivers.length > 0 && (
                    <ul className="text-sm list-disc pl-5 text-muted-foreground">
                      {latestProfile.key_drivers.map((d: any, i: number) => (
                        <li key={i}>{d.label} <span className="text-xs">(+{d.weight})</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No risk profile generated yet.</div>
              )}
            </div>
            <Button data-rbac="licensee_management.edit" size="sm" variant="outline" onClick={generateProfile} disabled={generating}>
              {generating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Generate risk profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Initial supervisory plan &amp; corrective actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canAutoCreate && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-3 w-3" />
              Issue a final determination and generate a risk profile to enable auto-creation.
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Uses templates aligned to the current risk-profile tier. The plan is created as a draft in the Supervisory Plan tab.
            </div>
            <div className="flex items-center gap-2">
              <Button data-rbac="licensee_management.edit" size="sm" onClick={autoCreatePlan} disabled={!canAutoCreate || creatingPlan}>
                {creatingPlan && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Auto-create initial plan
              </Button>
              {onOpenSupervisoryTab && (
                <Button size="sm" variant="ghost" onClick={onOpenSupervisoryTab}>
                  Open Supervisory Plan
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
