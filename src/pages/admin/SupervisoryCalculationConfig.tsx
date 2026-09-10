/**
 * Supervisory methodology calculation configuration (Administration).
 *
 * The supervisory owner publishes here the parameters the server-side
 * calculation engine needs: question response scoring, inherent and control
 * bands, the residual matrix, aggregation and recommendation policy, and the
 * effective-date rule per domain. Nothing is defaulted to a value that would
 * amount to a supervisory judgement, and no rating is computed in the browser —
 * a saved configuration becomes usable only once it is approved by a second
 * person and activated.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Plus, Save, ShieldCheck } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import {
  useCalcMethodologies, useCalculationConfigs, useCalculationConfigDetail,
  useMethodologyResponseOptions, useUpsertCalculationConfig, useSetResponseScores,
  useSetBands, useSetMatrix, useCalculationConfigLifecycle, useValidateCalculationConfig,
  useDomainCalculationRules, useSetDomainCalculationRule,
  riskScaleCodes, controlScaleCodes, calcErrorMessage, supervisoryDomainModule,
  type CalculationConfig, type ResponseScoreRow, type BandRow, type MatrixCell,
} from '@/hooks/useSupervisoryCalculationConfig';
import { QuestionParticipationEditor } from '@/components/admin/calculation/QuestionParticipationEditor';
import { DimensionPolicyEditor } from '@/components/admin/calculation/DimensionPolicyEditor';
import { FactTransformEditor } from '@/components/admin/calculation/FactTransformEditor';
import { MaterialityEditor } from '@/components/admin/calculation/MaterialityEditor';


// Option lists mirror the server contract exactly (see the CHECK constraints on
// supervisory_calculation_config). An option with no distinct implemented
// semantics is deliberately absent rather than offered and ignored.
const AGGREGATION = ['UNWEIGHTED_MEAN', 'WORST_RESPONSE'];
// The completeness rule decides when a dimension has enough answers to be rated.
// MIN_ANSWERED cannot be validated for a methodology whose dimensions publish
// differing mandatory-question counts; the server says so on validation.
const COMPLETENESS = ['MIN_ANSWERED', 'ALL_MANDATORY_APPLICABLE'];
const NA_HANDLING = ['EXCLUDE', 'INCLUDE_AS_ZERO', 'INCLUDE_AS_FULL'];
const EVIDENCE_HANDLING = ['FLAG_ONLY', 'NOT_CALCULABLE', 'CAP_AT_MIDPOINT'];
const CRITICAL_HANDLING = ['NONE'];
const ROUNDING = ['HALF_UP', 'HALF_DOWN', 'FLOOR', 'CEILING', 'NONE'];
const DIRECTION = ['DIRECT', 'INVERTED'];
// HIGHEST_DIMENSION is named for what the engine actually does: it takes the
// worst (highest ordinal) residual dimension. There is no governed notion of
// dimension materiality, so the option is not called "material".
const POLICIES = ['WEIGHTED_SCORE', 'HIGHEST_DIMENSION', 'WEIGHTED_WITH_THRESHOLD'];
const DATE_RULES = ['EXECUTION_DATE', 'ASSESSMENT_DATE', 'PERIOD_END', 'TRIGGER_DATE', 'EXPLICIT_AS_OF'];


function statusTone(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'ACTIVE') return 'default';
  if (status === 'REVIEW' || status === 'APPROVED') return 'secondary';
  if (status === 'RETIRED') return 'destructive';
  return 'outline';
}

export default function SupervisoryCalculationConfig() {
  const [methodologyId, setMethodologyId] = useState<string>('');
  const [configId, setConfigId] = useState<string>('');

  const { data: methodologies = [] } = useCalcMethodologies();
  const { data: configs = [] } = useCalculationConfigs(methodologyId || undefined);
  const { data: detail } = useCalculationConfigDetail(configId || undefined);
  const { data: responseOptions = [] } = useMethodologyResponseOptions(methodologyId || undefined);
  const { data: domainRules = [] } = useDomainCalculationRules();

  const upsert = useUpsertCalculationConfig();
  const setScores = useSetResponseScores();
  const setBands = useSetBands();
  const setMatrix = useSetMatrix();
  const lifecycle = useCalculationConfigLifecycle();
  const validate = useValidateCalculationConfig();
  const setDomainRule = useSetDomainCalculationRule();

  const methodology = methodologies.find((m) => m.id === methodologyId) ?? null;
  const config: CalculationConfig | null = configs.find((c) => c.id === configId) ?? null;
  const risk = useMemo(() => riskScaleCodes(methodology), [methodology]);
  const control = useMemo(() => controlScaleCodes(methodology), [methodology]);

  // Authority is derived from the methodology's own supervisory domain — the
  // server enforces the same rule on every write path.
  const configModule = supervisoryDomainModule(methodology?.domain_code);
  const mayManage = useCan(configModule ?? 'aml_supervision', 'manage_config');
  const isDraft = config?.status === 'DRAFT';
  const canEdit = !!isDraft && !!configModule && mayManage;

  // ------------------------------------------------------------------ state --
  const [params, setParams] = useState<Partial<CalculationConfig>>({});
  const [scores, setScoresState] = useState<ResponseScoreRow[]>([]);
  const [inherentBands, setInherentBands] = useState<Omit<BandRow, 'band_kind'>[]>([]);
  const [controlBands, setControlBands] = useState<Omit<BandRow, 'band_kind'>[]>([]);
  const [cells, setCells] = useState<MatrixCell[]>([]);
  const [rationale, setRationale] = useState('');
  const [problems, setProblems] = useState<string[] | null>(null);
  const [ruleDomain, setRuleDomain] = useState('');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleRationale, setRuleRationale] = useState('');

  const ruleDomainModule = supervisoryDomainModule(ruleDomain);
  const mayManageRuleDomain = useCan(ruleDomainModule ?? 'aml_supervision', 'manage_config');
  const domainCodes = useMemo(
    () => [...new Set(methodologies.map((m) => m.domain_code).filter(Boolean))].sort(),
    [methodologies],
  );

  useEffect(() => {
    if (config) setParams(config);
  }, [config]);

  useEffect(() => {
    if (!detail) return;
    setScoresState(
      responseOptions.map((code) => {
        const existing = detail.responses.find((r) => r.response_code === code);
        return existing ?? {
          response_code: code, score: null, meaning: null,
          excluded_from_denominator: false, sort_order: responseOptions.indexOf(code),
        };
      }),
    );
    setInherentBands(risk.map((code, i) => {
      const b = detail.bands.find((x) => x.band_kind === 'INHERENT' && x.band_code === code);
      return { band_code: code, min_score: b?.min_score ?? null, max_score: b?.max_score ?? null, sort_order: i };
    }));
    setControlBands(control.map((code, i) => {
      const b = detail.bands.find((x) => x.band_kind === 'CONTROL' && x.band_code === code);
      return { band_code: code, min_score: b?.min_score ?? null, max_score: b?.max_score ?? null, sort_order: i };
    }));
    setCells(detail.matrix);
  }, [detail, responseOptions, risk, control]);



  const cellFor = (inh: string, ctl: string) =>
    cells.find((c) => c.inherent_band === inh && c.control_band === ctl)?.residual_rating ?? '';

  const setCell = (inh: string, ctl: string, rating: string) => {
    setCells((prev) => {
      const rest = prev.filter((c) => !(c.inherent_band === inh && c.control_band === ctl));
      return rating ? [...rest, { inherent_band: inh, control_band: ctl, residual_rating: rating }] : rest;
    });
  };

  const fail = (e: unknown) => toast.error(calcErrorMessage(e));

  // ---------------------------------------------------------------- actions --
  const createDraft = async () => {
    if (!methodologyId) return;
    try {
      const id = await upsert.mutateAsync({ methodologyId, payload: {} });
      setConfigId(id);
      toast.success('Draft calculation configuration created.');
    } catch (e) { fail(e); }
  };

  const saveParams = async () => {
    if (!config) return;
    // Undecided parameters are omitted, never sent as a substitute value: the
    // server keeps them undecided and refuses submission while they are.
    const decided: Record<string, unknown> = {
      effective_to: params.effective_to ?? '',
      recommendation_threshold: params.recommendation_threshold ?? '',
      override_threshold: params.override_threshold ?? '',
      notes: params.notes ?? '',
    };
    ([
      'effective_from', 'aggregation_method', 'min_answered_questions',
      'na_denominator_handling', 'evidence_insufficiency_handling',
      'critical_question_handling', 'rounding_mode', 'rounding_decimals',
      'inherent_direction', 'recommendation_policy',
    ] as const).forEach((k) => {
      const v = params[k];
      if (v !== null && v !== undefined && v !== '') decided[k] = v;
    });
    try {
      await upsert.mutateAsync({ methodologyId: config.methodology_id, configId: config.id, payload: decided });
      toast.success('Calculation parameters saved.');
    } catch (e) { fail(e); }
  };


  const saveScores = async () => {
    if (!config) return;
    try {
      await setScores.mutateAsync({ configId: config.id, rows: scores });
      toast.success('Response scoring saved.');
    } catch (e) { fail(e); }
  };

  const saveBands = async (kind: 'INHERENT' | 'CONTROL') => {
    if (!config) return;
    try {
      await setBands.mutateAsync({ configId: config.id, bandKind: kind, rows: kind === 'INHERENT' ? inherentBands : controlBands });
      toast.success(`${kind === 'INHERENT' ? 'Inherent' : 'Control'} bands saved.`);
    } catch (e) { fail(e); }
  };

  const saveMatrix = async () => {
    if (!config) return;
    try {
      await setMatrix.mutateAsync({ configId: config.id, cells });
      toast.success('Residual matrix saved.');
    } catch (e) { fail(e); }
  };

  const runValidate = async () => {
    if (!config) return;
    try {
      const result = await validate.mutateAsync(config.id);
      setProblems(result.problems ?? []);
      if (result.ok) toast.success('The configuration is complete and may be submitted for approval.');
    } catch (e) { fail(e); }
  };

  const submitForApproval = async () => {
    if (!config) return;
    try {
      await lifecycle.mutateAsync({ configId: config.id, toStatus: 'REVIEW', rationale });
      setRationale('');
      toast.success('Submitted for independent approval.');
    } catch (e) { fail(e); }
  };

  const saveDomainRule = async () => {
    try {
      await setDomainRule.mutateAsync({ domainCode: ruleDomain, effectiveDateRule: ruleValue, rationale: ruleRationale });
      setRuleRationale('');
      toast.success('Effective-date rule recorded.');
    } catch (e) { fail(e); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Calculation Configuration"
          description="Publish the parameters the supervisory calculation engine uses: response scoring, risk bands, the residual matrix, aggregation and the effective-date rule. A configuration takes effect only after independent approval."
          backHref="/admin/config/supervision"
          backLabel="Supervision Configuration"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Methodology</CardTitle>
            <CardDescription>Choose the published methodology whose calculation you are configuring.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Methodology</Label>
              <Select value={methodologyId || 'none'} onValueChange={(v) => { setMethodologyId(v === 'none' ? '' : v); setConfigId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select a methodology" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a methodology</SelectItem>
                  {methodologies.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.domain_code} — {m.title ?? m.name ?? m.code} v{m.version} ({m.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {methodology && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Risk scale:</span> {risk.join(' · ') || 'not published'}</p>
                <p><span className="font-medium text-foreground">Control scale:</span> {control.join(' · ') || 'not published'}</p>
                <p><span className="font-medium text-foreground">Response options:</span> {responseOptions.join(' · ') || 'not published'}</p>
                {methodology.calculation_guidance && <p className="pt-1">{methodology.calculation_guidance}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {methodologyId && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Configuration versions</CardTitle>
                <CardDescription>Only one version can be active per methodology; superseded versions remain as evidence.</CardDescription>
              </div>
              <Button data-rbac="aml_supervision.manage_config" onClick={createDraft}
                disabled={upsert.isPending || !configModule || !mayManage}>

                <Plus className="h-4 w-4 mr-2" />New draft version
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead><TableHead>Status</TableHead>
                    <TableHead>Effective from</TableHead><TableHead>Effective to</TableHead>
                    <TableHead>Policy</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-muted-foreground">No calculation configuration exists for this methodology yet.</TableCell></TableRow>
                  )}
                  {configs.map((c) => (
                    <TableRow key={c.id} className={c.id === configId ? 'bg-muted/50' : undefined}>
                      <TableCell className="font-mono">v{c.config_version}</TableCell>
                      <TableCell><Badge variant={statusTone(c.status)}>{c.status}</Badge></TableCell>
                      <TableCell>{c.effective_from ?? '—'}</TableCell>
                      <TableCell>{c.effective_to ?? '—'}</TableCell>
                      <TableCell className="text-xs">{c.recommendation_policy}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setConfigId(c.id)}>Open</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {config && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Version {config.config_version}
                <Badge variant={statusTone(config.status)}>{config.status}</Badge>
              </CardTitle>
              <CardDescription>
                {isDraft
                  ? 'Draft — parameters may be edited. Submit for approval once complete.'
                  : 'This version has left draft, so it is read-only. Create a new draft version to change any parameter.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {problems && problems.length > 0 && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>The configuration is not yet complete</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </AlertDescription>
                </Alert>
              )}
              {problems && problems.length === 0 && (
                <Alert className="mb-4">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Complete</AlertTitle>
                  <AlertDescription>Every parameter the calculation needs is published.</AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="parameters">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="parameters">Parameters</TabsTrigger>
                  <TabsTrigger value="responses">Response scoring</TabsTrigger>
                  <TabsTrigger value="questions">Question participation</TabsTrigger>
                  <TabsTrigger value="dimensions">Dimension policy</TabsTrigger>
                  <TabsTrigger value="facts">Fact transformation</TabsTrigger>
                  <TabsTrigger value="materiality">Materiality</TabsTrigger>
                  <TabsTrigger value="bands">Bands</TabsTrigger>
                  <TabsTrigger value="matrix">Residual matrix</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="parameters" className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Nothing below is pre-selected. Every parameter is a supervisory decision and the configuration cannot be submitted while any of them is undecided.
                  </p>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Effective from</Label>
                      <Input type="date" disabled={!isDraft} value={params.effective_from ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, effective_from: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Effective to (exclusive, optional)</Label>
                      <Input type="date" disabled={!isDraft} value={params.effective_to ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, effective_to: e.target.value === '' ? null : e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Minimum answered questions</Label>
                      <Input type="number" min={0} disabled={!isDraft} placeholder="not decided"
                        value={params.min_answered_questions ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, min_answered_questions: e.target.value === '' ? null : Number(e.target.value) }))} />
                    </div>
                    {([
                      ['aggregation_method', 'Dimension aggregation', AGGREGATION],
                      ['na_denominator_handling', 'Not-applicable responses', NA_HANDLING],
                      ['evidence_insufficiency_handling', 'Insufficient evidence', EVIDENCE_HANDLING],
                      ['critical_question_handling', 'Critical question failure', CRITICAL_HANDLING],
                      ['rounding_mode', 'Rounding', ROUNDING],
                      ['inherent_direction', 'Score direction for inherent risk', DIRECTION],
                      ['recommendation_policy', 'Overall recommendation policy', POLICIES],
                    ] as const).map(([field, label, options]) => (
                      <div className="space-y-2" key={field}>
                        <Label>{label}</Label>
                        <Select disabled={!isDraft}
                          value={params[field] == null ? 'none' : String(params[field])}
                          onValueChange={(v) => setParams((p) => ({ ...p, [field]: v === 'none' ? null : v }))}>
                          <SelectTrigger><SelectValue placeholder="Not decided" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not decided</SelectItem>
                            {options.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div className="space-y-2">
                      <Label>Rounding decimals</Label>
                      <Input type="number" min={0} max={4} disabled={!isDraft} placeholder="not decided"
                        value={params.rounding_decimals ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, rounding_decimals: e.target.value === '' ? null : Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Recommendation threshold rating</Label>
                      <Select disabled={!isDraft} value={params.recommendation_threshold ?? 'none'}
                        onValueChange={(v) => setParams((p) => ({ ...p, recommendation_threshold: v === 'none' ? null : v }))}>
                        <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {risk.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Override notification threshold</Label>
                      <Select disabled={!isDraft} value={params.override_threshold ?? 'none'}
                        onValueChange={(v) => setParams((p) => ({ ...p, override_threshold: v === 'none' ? null : v }))}>
                        <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {risk.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes for the approver</Label>
                    <Textarea disabled={!isDraft} value={params.notes ?? ''} rows={3}
                      onChange={(e) => setParams((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                  {isDraft && (
                    <Button data-rbac="aml_supervision.manage_config" onClick={saveParams} disabled={upsert.isPending || !canEdit}>
                      <Save className="h-4 w-4 mr-2" />Save parameters
                    </Button>
                  )}
                </TabsContent>


                <TabsContent value="responses" className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Every response option the methodology's questions permit must be scored, or explicitly excluded from the denominator.
                    Evidence requirements come from the methodology's own questions, not from the score row.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Response</TableHead><TableHead>Score (0–100)</TableHead>
                        <TableHead>Excluded from the denominator</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scores.map((row, i) => (
                        <TableRow key={row.response_code}>
                          <TableCell className="font-mono">{row.response_code}</TableCell>
                          <TableCell>
                            <Input type="number" min={0} max={100} className="w-24" disabled={!isDraft || row.excluded_from_denominator}
                              value={row.score ?? ''}
                              onChange={(e) => setScoresState((prev) => prev.map((r, j) => j === i ? { ...r, score: e.target.value === '' ? null : Number(e.target.value) } : r))} />
                          </TableCell>
                          <TableCell>
                            <Checkbox disabled={!isDraft} checked={row.excluded_from_denominator}
                              onCheckedChange={(v) => setScoresState((prev) => prev.map((r, j) => j === i ? { ...r, excluded_from_denominator: v === true } : r))} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {isDraft && (
                    <Button data-rbac="aml_supervision.manage_config" onClick={saveScores} disabled={setScores.isPending || !canEdit}>
                      <Save className="h-4 w-4 mr-2" />Save response scoring
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="questions" className="pt-4">
                  <QuestionParticipationEditor configId={config.id} methodologyId={config.methodology_id} canEdit={canEdit} />
                </TabsContent>

                <TabsContent value="dimensions" className="pt-4">
                  <DimensionPolicyEditor configId={config.id} methodologyId={config.methodology_id} canEdit={canEdit} />
                </TabsContent>

                <TabsContent value="facts" className="pt-4">
                  <FactTransformEditor configId={config.id} methodologyId={config.methodology_id} canEdit={canEdit} bandCodes={risk} />
                </TabsContent>

                <TabsContent value="materiality" className="pt-4">
                  <MaterialityEditor configId={config.id} methodologyId={config.methodology_id} canEdit={canEdit} bandCodes={risk} />
                </TabsContent>

                <TabsContent value="bands" className="space-y-6 pt-4">
                  {([['INHERENT', 'Inherent risk bands', inherentBands, setInherentBands],
                     ['CONTROL', 'Control effectiveness bands', controlBands, setControlBands]] as const).map(([kind, title, rows, setRows]) => (
                    <div key={kind} className="space-y-3">
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Each band covers scores from its lower edge up to — but excluding — its upper edge; the last band closes at 100.
                        Bands must be contiguous, non-overlapping and start at 0. No edge is pre-filled.
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow><TableHead>Rating</TableHead><TableHead>From (inclusive)</TableHead><TableHead>To (exclusive)</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.length === 0 && (
                            <TableRow><TableCell colSpan={3} className="text-muted-foreground">The methodology publishes no {kind.toLowerCase()} scale.</TableCell></TableRow>
                          )}
                          {rows.map((b, i) => (
                            <TableRow key={b.band_code}>
                              <TableCell className="font-mono">{b.band_code}</TableCell>
                              {(['min_score', 'max_score'] as const).map((f) => (
                                <TableCell key={f}>
                                  <Input type="number" min={0} max={100} className="w-24" disabled={!isDraft}
                                    placeholder="not decided" value={b[f] ?? ''}
                                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, [f]: e.target.value === '' ? null : Number(e.target.value) } : r))} />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {isDraft && rows.length > 0 && (
                        <Button data-rbac="aml_supervision.manage_config" variant="outline" onClick={() => saveBands(kind)} disabled={setBands.isPending || !canEdit}>
                          <Save className="h-4 w-4 mr-2" />Save {kind.toLowerCase()} bands
                        </Button>
                      )}
                    </div>
                  ))}
                </TabsContent>


                <TabsContent value="matrix" className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Every inherent × control combination must resolve to a published residual rating.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Inherent \ Control</TableHead>
                          {control.map((c) => <TableHead key={c}>{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {risk.map((inh) => (
                          <TableRow key={inh}>
                            <TableCell className="font-mono">{inh}</TableCell>
                            {control.map((ctl) => (
                              <TableCell key={ctl}>
                                <Select disabled={!isDraft} value={cellFor(inh, ctl) || 'none'}
                                  onValueChange={(v) => setCell(inh, ctl, v === 'none' ? '' : v)}>
                                  <SelectTrigger className="w-36"><SelectValue placeholder="Not set" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Not set</SelectItem>
                                    {risk.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {isDraft && risk.length > 0 && control.length > 0 && (
                    <Button data-rbac="aml_supervision.manage_config" onClick={saveMatrix} disabled={setMatrix.isPending || !canEdit}>
                      <Save className="h-4 w-4 mr-2" />Save residual matrix
                    </Button>
                  )}

                </TabsContent>

                <TabsContent value="history" className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Rationale</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail?.events ?? []).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                          <TableCell>{e.event_type}</TableCell>
                          <TableCell>{e.from_status ? `${e.from_status} → ${e.to_status ?? ''}` : (e.to_status ?? '—')}</TableCell>
                          <TableCell className="text-muted-foreground">{e.rationale ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>

              {isDraft && (
                <div className="mt-6 space-y-3 border-t pt-4">
                  <Label htmlFor="calc-rationale">Rationale for submission (at least 10 characters)</Label>
                  <Textarea id="calc-rationale" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                  <div className="flex gap-2">
                    <Button data-rbac="aml_supervision.manage_config" variant="outline" onClick={runValidate} disabled={validate.isPending || !canEdit}>
                      <ShieldCheck className="h-4 w-4 mr-2" />Check completeness
                    </Button>
                    <Button data-rbac="aml_supervision.manage_config" onClick={submitForApproval}
                      disabled={lifecycle.isPending || !canEdit || rationale.trim().length < 10}>
                      Submit for approval
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effective-date rule by domain</CardTitle>
            <CardDescription>
              Which date decides the methodology and calculation version in force for an assessment. Recorded as a supervisory decision with a rationale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Domain</TableHead><TableHead>Rule</TableHead><TableHead>Rationale</TableHead><TableHead>Decided</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {domainRules.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground">
                    No effective-date rule has been recorded. Until one is, no assessment in that domain can be calculated — there is no fallback date.
                  </TableCell></TableRow>
                )}
                {domainRules.map((r) => (
                  <TableRow key={r.domain_code}>
                    <TableCell className="font-mono">{r.domain_code}</TableCell>
                    <TableCell>{r.effective_date_rule.replace(/_/g, ' ').toLowerCase()}</TableCell>
                    <TableCell className="text-muted-foreground">{r.rationale ?? '—'}</TableCell>
                    <TableCell>{r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={ruleDomain || 'none'} onValueChange={(v) => setRuleDomain(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select a domain" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a domain</SelectItem>
                    {domainCodes.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rule</Label>
                <Select value={ruleValue || 'none'} onValueChange={(v) => setRuleValue(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select a rule" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a rule</SelectItem>
                    {DATE_RULES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rationale</Label>
                <Input value={ruleRationale} onChange={(e) => setRuleRationale(e.target.value)} />
              </div>
            </div>
            {ruleDomain && !ruleDomainModule && (
              <p className="text-sm text-destructive">This domain has no configuration module, so no one can record a rule for it.</p>
            )}
            <Button data-rbac="aml_supervision.manage_config" onClick={saveDomainRule}
              disabled={setDomainRule.isPending || !ruleDomain || !ruleValue || !ruleDomainModule
                        || !mayManageRuleDomain || ruleRationale.trim().length < 10}>
              <Save className="h-4 w-4 mr-2" />Record effective-date rule
            </Button>

          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
