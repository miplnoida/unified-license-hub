import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save } from 'lucide-react';
import {
  OBSERVANCE_LEVELS,
  labelOf,
  observanceTone,
  usePaymentOperator,
  usePfmiApplicability,
  usePfmiAssessment,
  usePfmiAssessmentPrinciples,
  usePfmiPrinciples,
  useCompletePfmiAssessment,
  useSavePfmiPrinciple,
} from '@/hooks/usePaymentSystems';

export default function PfmiAssessmentWizard() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading } = usePfmiAssessment(assessmentId);
  const { data: operator } = usePaymentOperator(assessment?.operator_id);
  const { data: catalogue = [] } = usePfmiPrinciples();
  const { data: applicability = [] } = usePfmiApplicability(operator?.operator_type);
  const { data: rows = [] } = usePfmiAssessmentPrinciples(assessmentId);
  const savePrinciple = useSavePfmiPrinciple(assessmentId);
  const complete = useCompletePfmiAssessment(assessmentId);

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Record<number, { self?: string; reg?: string; narrative?: string }>>({});
  const [summary, setSummary] = useState('');

  const applicable = useMemo(() => {
    const allowed = new Set(applicability.map(a => a.principle_number));
    const list = catalogue.filter(p => (allowed.size ? allowed.has(p.principle_number) : true));
    return list.length ? list : catalogue;
  }, [catalogue, applicability]);

  const saved = useMemo(() => new Map(rows.map(r => [r.principle_number, r])), [rows]);
  const current = applicable[index];
  const currentSaved = current ? saved.get(current.principle_number) : undefined;
  const currentDraft = current ? draft[current.principle_number] : undefined;

  const rated = applicable.filter(p => {
    const r = saved.get(p.principle_number);
    return !!(r?.regulatory_score || r?.self_score);
  }).length;
  const completed = assessment?.status === 'completed';

  const setField = (field: 'self' | 'reg' | 'narrative', value: string) => {
    if (!current) return;
    setDraft(d => ({
      ...d,
      [current.principle_number]: { ...d[current.principle_number], [field]: value },
    }));
  };

  const value = (field: 'self' | 'reg' | 'narrative') => {
    if (currentDraft?.[field] !== undefined) return currentDraft[field] as string;
    if (field === 'self') return currentSaved?.self_score ?? '';
    if (field === 'reg') return currentSaved?.regulatory_score ?? '';
    return currentSaved?.narrative ?? '';
  };

  const saveCurrent = async () => {
    if (!current) return;
    await savePrinciple.mutateAsync({
      principle_number: current.principle_number,
      self_score: value('self') || null,
      regulatory_score: value('reg') || null,
      narrative: value('narrative') || null,
    });
  };

  if (isLoading) {
    return <DashboardLayout><div className="py-20 text-center">
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
    </div></DashboardLayout>;
  }

  if (!assessment) {
    return <DashboardLayout><Card><CardContent className="py-16 text-center text-muted-foreground">
      Assessment not found or you do not have access to it.
    </CardContent></Card></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/prudential/payment-systems')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to oversight
          </Button>
          <div>
            <h1 className="text-xl font-semibold">PFMI assessment — {operator?.operator_name ?? '—'}</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {assessment.reference} · Assessment year {assessment.assessment_year}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{assessment.status}</Badge>
            {assessment.overall_rating && (
              <Badge variant="outline" className={observanceTone(assessment.overall_rating)}>
                {labelOf(OBSERVANCE_LEVELS, assessment.overall_rating)}
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Principles rated</span>
              <span className="font-mono">{rated} / {applicable.length}</span>
            </div>
            <Progress value={applicable.length ? (rated / applicable.length) * 100 : 0} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Applicable principles</CardTitle></CardHeader>
            <CardContent className="p-2 max-h-[520px] overflow-y-auto space-y-1">
              {applicable.map((p, i) => {
                const r = saved.get(p.principle_number);
                const score = r?.regulatory_score ?? r?.self_score;
                return (
                  <button key={p.principle_number} onClick={() => setIndex(i)}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-muted ${i === index ? 'bg-muted font-medium' : ''}`}>
                    <span className="font-mono mr-1">{p.principle_number}.</span>{p.title}
                    {score && (
                      <Badge variant="outline" className={`ml-1 ${observanceTone(score)}`}>
                        {labelOf(OBSERVANCE_LEVELS, score).charAt(0)}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {current && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Principle {current.principle_number} — {current.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{current.category}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Operator self-assessment</Label>
                      <Select value={value('self') || 'unrated'} disabled={completed}
                        onValueChange={v => setField('self', v === 'unrated' ? '' : v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unrated">Not rated</SelectItem>
                          {OBSERVANCE_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Regulatory assessment</Label>
                      <Select value={value('reg') || 'unrated'} disabled={completed}
                        onValueChange={v => setField('reg', v === 'unrated' ? '' : v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unrated">Not rated</SelectItem>
                          {OBSERVANCE_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Assessment narrative and evidence</Label>
                    <Textarea rows={5} disabled={completed} value={value('narrative')}
                      onChange={e => setField('narrative', e.target.value)}
                      placeholder="Observations, gaps identified, supporting evidence reviewed…" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={completed || savePrinciple.isPending}
                      data-rbac="prudential_supervision.edit" onClick={saveCurrent}>
                      {savePrinciple.isPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                        : <><Save className="h-4 w-4 mr-2" />Save principle</>}
                    </Button>
                    <Button size="sm" variant="outline" disabled={index === 0}
                      onClick={() => setIndex(i => Math.max(0, i - 1))}>
                      <ArrowLeft className="h-4 w-4 mr-2" />Previous
                    </Button>
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" disabled={index >= applicable.length - 1}
                      onClick={async () => {
                        if (!completed) await saveCurrent();
                        setIndex(i => Math.min(applicable.length - 1, i + 1));
                      }}>
                      Save &amp; next<ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Assessment conclusion</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Overall summary</Label>
                  <Textarea rows={4} disabled={completed}
                    value={completed ? (assessment.summary ?? '') : summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder="Summarise observance, key gaps and required remediation." />
                </div>
                {completed ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Completed {assessment.completed_at ? new Date(assessment.completed_at).toLocaleString() : ''} —
                    overall rating {labelOf(OBSERVANCE_LEVELS, assessment.overall_rating)}.
                  </p>
                ) : (
                  <Button data-rbac="prudential_supervision.edit"
                    disabled={rated < applicable.length || complete.isPending}
                    onClick={() => complete.mutateAsync(summary || undefined)}>
                    {complete.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Completing…</>
                      : 'Complete assessment'}
                  </Button>
                )}
                {!completed && rated < applicable.length && (
                  <p className="text-xs text-muted-foreground">
                    Rate all {applicable.length} applicable principles before completing the assessment.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
