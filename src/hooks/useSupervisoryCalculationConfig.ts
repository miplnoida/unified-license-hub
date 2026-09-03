/**
 * Supervisory methodology calculation configuration.
 *
 * Every write is a call to a governed operation on the supervisory spine — no
 * screen writes to a calculation table directly, and no calculated rating is
 * ever produced in the browser. Reads go against the configuration stores,
 * which carry read policies for internal supervisory viewers.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CalcStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';

export interface CalculationConfig {
  id: string;
  methodology_id: string;
  config_version: number;
  status: CalcStatus;
  effective_from: string | null;
  effective_to: string | null;
  aggregation_method: string;
  min_answered_questions: number;
  na_denominator_handling: string;
  evidence_insufficiency_handling: string;
  critical_question_handling: string;
  rounding_mode: string;
  rounding_decimals: number;
  inherent_direction: string;
  recommendation_policy: string;
  recommendation_threshold: string | null;
  override_threshold: string | null;
  notes: string | null;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  activated_at: string | null;
}

export interface ResponseScoreRow {
  response_code: string;
  score: number | null;
  meaning?: string | null;
  excluded_from_denominator: boolean;
  requires_observation: boolean;
  requires_evidence: boolean;
  requires_rationale: boolean;
  is_critical_floor: boolean;
  sort_order: number;
}

export interface BandRow {
  band_kind: 'INHERENT' | 'CONTROL';
  band_code: string;
  min_score: number;
  max_score: number;
  sort_order: number;
}

export interface MatrixCell {
  inherent_band: string;
  control_band: string;
  residual_rating: string;
}

export interface MethodologyLite {
  id: string;
  code: string;
  title: string | null;
  name: string | null;
  version: string;
  status: string;
  domain_code: string;
  effective_from: string | null;
  effective_to: string | null;
  scoring_scale: unknown;
  definition: unknown;
  calculation_guidance: string | null;
  override_threshold: string | null;
}

const CALC_KEY = ['supervisory-calculation'] as const;

/** Human copy for the governed operations' known refusals. */
export function calcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw.includes('not_authorized')) return 'You are not authorised to configure the supervisory calculation.';
  if (raw.includes('not_found: methodology')) return 'That methodology no longer exists.';
  if (raw.includes('not_found: calculation configuration')) return 'That calculation configuration no longer exists.';
  if (raw.includes('only be edited while it is a draft') || raw.includes('only be edited while the configuration is a draft')) {
    return 'This configuration has left draft, so its parameters can no longer be edited. Create a new version instead.';
  }
  if (raw.includes('approver must be a different person')) {
    return 'The approver must be a different person from the author of the configuration.';
  }
  if (raw.includes('rationale of at least 10 characters')) return 'Please record a rationale of at least 10 characters.';
  if (raw.includes('the configuration is incomplete')) {
    return `The configuration is incomplete: ${raw.split('the configuration is incomplete:').pop()?.trim() ?? ''}`;
  }
  if (raw.includes('only a draft may be submitted')) return 'Only a draft may be submitted for approval.';
  if (raw.includes('only a configuration under review may be approved')) return 'Only a configuration under review may be approved.';
  if (raw.includes('only an approved configuration may be activated')) return 'Only an approved configuration may be activated.';
  if (raw.includes('methodology_frozen')) return 'The methodology version of an approved assessment cannot be changed.';
  return raw || 'The operation could not be completed.';
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function useInvalidateCalc() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CALC_KEY });
  };
}

/** Methodologies that may carry a calculation configuration. */
export function useCalcMethodologies(domainCode?: string) {
  return useQuery({
    queryKey: [...CALC_KEY, 'methodologies', domainCode ?? 'ALL'],
    queryFn: async (): Promise<MethodologyLite[]> => {
      let q = supabase
        .from('supervisory_methodology')
        .select('id, code, title, name, version, status, domain_code, effective_from, effective_to, scoring_scale, definition, calculation_guidance, override_threshold')
        .order('domain_code')
        .order('effective_from', { ascending: false });
      if (domainCode) q = q.eq('domain_code', domainCode);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MethodologyLite[];
    },
  });
}

/** Response options the methodology's active questions permit. */
export function useMethodologyResponseOptions(methodologyId?: string) {
  return useQuery({
    queryKey: [...CALC_KEY, 'response-options', methodologyId],
    enabled: !!methodologyId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('supervisory_methodology_question')
        .select('response_options')
        .eq('methodology_id', methodologyId!)
        .eq('active', true);
      if (error) throw new Error(error.message);
      const set = new Set<string>();
      for (const row of (data ?? []) as { response_options: string[] | null }[]) {
        for (const o of row.response_options ?? []) if (o) set.add(o.toUpperCase());
      }
      return [...set].sort();
    },
  });
}

export function useCalculationConfigs(methodologyId?: string) {
  return useQuery({
    queryKey: [...CALC_KEY, 'configs', methodologyId ?? 'ALL'],
    queryFn: async (): Promise<CalculationConfig[]> => {
      let q = supabase
        .from('supervisory_calculation_config')
        .select('*')
        .order('config_version', { ascending: false });
      if (methodologyId) q = q.eq('methodology_id', methodologyId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CalculationConfig[];
    },
  });
}

export function useCalculationConfigDetail(configId?: string) {
  return useQuery({
    queryKey: [...CALC_KEY, 'detail', configId],
    enabled: !!configId,
    queryFn: async () => {
      const [responses, bands, matrix, events] = await Promise.all([
        supabase.from('supervisory_calculation_response_score').select('*').eq('config_id', configId!).order('sort_order'),
        supabase.from('supervisory_calculation_band').select('*').eq('config_id', configId!).order('band_kind').order('min_score'),
        supabase.from('supervisory_calculation_matrix_cell').select('*').eq('config_id', configId!),
        supabase.from('supervisory_calculation_event').select('*').eq('config_id', configId!).order('created_at', { ascending: false }).limit(50),
      ]);
      const err = responses.error ?? bands.error ?? matrix.error ?? events.error;
      if (err) throw new Error(err.message);
      return {
        responses: (responses.data ?? []) as unknown as ResponseScoreRow[],
        bands: (bands.data ?? []) as unknown as BandRow[],
        matrix: (matrix.data ?? []) as unknown as MatrixCell[],
        events: (events.data ?? []) as unknown as Array<{
          id: string; event_type: string; from_status: string | null; to_status: string | null;
          rationale: string | null; created_at: string;
        }>,
      };
    },
  });
}

/** Server-side completeness validation of a configuration. */
export function useValidateCalculationConfig() {
  return useMutation({
    mutationFn: (configId: string) =>
      rpc<{ ok: boolean; problems: string[] }>('supervisory_calculation_config_validate', { _config_id: configId }),
  });
}

export function useUpsertCalculationConfig() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { methodologyId: string; payload: Record<string, unknown>; configId?: string }) =>
      rpc<string>('supervisory_calculation_config_upsert', {
        _methodology_id: input.methodologyId,
        _payload: input.payload,
        _config_id: input.configId ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useSetResponseScores() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { configId: string; rows: ResponseScoreRow[] }) =>
      rpc<number>('supervisory_calculation_response_scores_set', { _config_id: input.configId, _rows: input.rows }),
    onSuccess: invalidate,
  });
}

export function useSetBands() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { configId: string; bandKind: 'INHERENT' | 'CONTROL'; rows: Omit<BandRow, 'band_kind'>[] }) =>
      rpc<number>('supervisory_calculation_bands_set', {
        _config_id: input.configId, _band_kind: input.bandKind, _rows: input.rows,
      }),
    onSuccess: invalidate,
  });
}

export function useSetMatrix() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { configId: string; cells: MatrixCell[] }) =>
      rpc<number>('supervisory_calculation_matrix_set', { _config_id: input.configId, _cells: input.cells }),
    onSuccess: invalidate,
  });
}

export function useCalculationConfigLifecycle() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { configId: string; toStatus: 'REVIEW' | 'APPROVED' | 'DRAFT' | 'ACTIVE' | 'RETIRED'; rationale: string }) =>
      rpc<string>('supervisory_calculation_config_lifecycle', {
        _config_id: input.configId, _to_status: input.toStatus, _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/** The recorded effective-date rule per supervisory domain. */
export function useDomainCalculationRules() {
  return useQuery({
    queryKey: [...CALC_KEY, 'domain-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supervisory_domain_calculation_rule')
        .select('domain_code, effective_date_rule, rationale, decided_at')
        .order('domain_code');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<{
        domain_code: string; effective_date_rule: string; rationale: string | null; decided_at: string | null;
      }>;
    },
  });
}

export function useSetDomainCalculationRule() {
  const invalidate = useInvalidateCalc();
  return useMutation({
    mutationFn: (input: { domainCode: string; effectiveDateRule: string; rationale: string }) =>
      rpc<string>('supervisory_domain_calculation_rule_set', {
        _domain_code: input.domainCode,
        _effective_date_rule: input.effectiveDateRule,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/** Scale helpers derived from the published methodology (never invented here). */
export function riskScaleCodes(m?: MethodologyLite | null): string[] {
  const scale = (m?.scoring_scale ?? []) as Array<{ code?: string; ordinal?: number }>;
  return Array.isArray(scale)
    ? scale.filter((s) => !!s?.code).sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)).map((s) => String(s.code).toUpperCase())
    : [];
}

export function controlScaleCodes(m?: MethodologyLite | null): string[] {
  const def = (m?.definition ?? {}) as { control_scale?: unknown };
  const cs = def?.control_scale;
  return Array.isArray(cs) ? cs.map((c) => String(c).toUpperCase()) : [];
}
