import { supabase } from '@/integrations/supabase/client';

export type SufficiencyTrigger =
  | 'manual'
  | 'application_opened'
  | 'application_submitted'
  | 'rfi_created'
  | 'rfi_closed'
  | 'decision_attempt';

export type SufficiencyStatus = 'passed' | 'warning' | 'blocked' | 'not_evaluated';
export type SufficiencyResultStatus = 'pass' | 'fail' | 'warning' | 'info' | 'skipped';
export type SufficiencyResultSeverity = 'blocker' | 'warning' | 'info';

export interface SufficiencyResult {
  id?: string;
  ruleId?: string | null;
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  severity: SufficiencyResultSeverity;
  status: SufficiencyResultStatus;
  message?: string | null;
  evidence?: Record<string, unknown>;
  suggestedRfiPrompt?: string | null;
  suggestedRfiQuestionType?: 'text' | 'document' | 'both' | null;
  autoRfi?: boolean;
}

export interface SufficiencyEvaluationSummary {
  evaluationId: string;
  status: SufficiencyStatus;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  results: SufficiencyResult[];
  generatedRfiId?: string | null;
  evaluatedAt?: string;
}

function mapOverallStatus(s: string): SufficiencyStatus {
  if (s === 'sufficient') return 'passed';
  if (s === 'warning') return 'warning';
  if (s === 'insufficient') return 'blocked';
  if (s === 'passed' || s === 'blocked' || s === 'not_evaluated') return s as SufficiencyStatus;
  return 'not_evaluated';
}

function mapResultRow(row: any): SufficiencyResult {
  const snap = row.rule_snapshot ?? {};
  const detail = row.detail ?? {};
  return {
    id: row.id,
    ruleId: row.rule_id ?? null,
    ruleCode: snap.code ?? snap.rule_code ?? '',
    ruleName: snap.name ?? snap.rule_name ?? '(unnamed rule)',
    ruleType: snap.rule_type ?? '',
    severity: (row.severity ?? snap.severity ?? 'info') as SufficiencyResultSeverity,
    status: row.status as SufficiencyResultStatus,
    message: detail?.error ?? detail?.message ?? null,
    evidence: detail,
    suggestedRfiPrompt: snap.rfi_prompt_template ?? snap.suggested_rfi_prompt ?? null,
    suggestedRfiQuestionType: (snap.rfi_question_type ?? null) as any,
    autoRfi: !!snap.auto_rfi,
  };
}

/** Invoke server-side evaluation. */
export async function evaluateApplicationSufficiency(params: {
  applicationId: string;
  triggerSource?: SufficiencyTrigger;
  evaluatedBy?: string | null;
  generateRfi?: boolean;
}): Promise<SufficiencyEvaluationSummary> {
  const { data, error } = await supabase.functions.invoke('evaluate-application-sufficiency', {
    body: {
      application_id: params.applicationId,
      triggered_by: params.triggerSource ?? 'manual',
      generate_rfi: params.generateRfi ?? false,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);

  const summary: SufficiencyEvaluationSummary = {
    evaluationId: (data as any).evaluation_id,
    status: mapOverallStatus((data as any).overall_status),
    blockerCount: (data as any).blocker_count ?? 0,
    warningCount: (data as any).warning_count ?? 0,
    infoCount: 0,
    results: [],
    generatedRfiId: (data as any).generated_rfi_id ?? null,
  };

  // Load results for the caller (edge fn does not return them)
  const { data: rows } = await supabase
    .from('sufficiency_evaluation_results' as any)
    .select('*')
    .eq('evaluation_id', summary.evaluationId);
  summary.results = ((rows as any[]) || []).map(mapResultRow);
  summary.infoCount = summary.results.filter((r) => r.severity === 'info').length;
  return summary;
}

/** Load latest persisted evaluation for an application. */
export async function getLatestSufficiencyEvaluation(
  applicationId: string,
): Promise<SufficiencyEvaluationSummary | null> {
  const { data: eval_ } = await supabase
    .from('sufficiency_evaluations' as any)
    .select('*')
    .eq('application_id', applicationId)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!eval_) return null;
  const e = eval_ as any;
  const { data: rows } = await supabase
    .from('sufficiency_evaluation_results' as any)
    .select('*')
    .eq('evaluation_id', e.id);
  const results = ((rows as any[]) || []).map(mapResultRow);
  return {
    evaluationId: e.id,
    status: mapOverallStatus(e.overall_status),
    blockerCount: e.blocker_count ?? 0,
    warningCount: e.warning_count ?? 0,
    infoCount: results.filter((r) => r.severity === 'info').length,
    results,
    evaluatedAt: e.evaluated_at,
  };
}
