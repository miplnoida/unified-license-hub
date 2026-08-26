/**
 * MC-11 — Supervisory management reporting, regulatory MI and evidence packs.
 *
 * Every figure the workspace shows is calculated server-side by a governed
 * `conduct_mi_*` read model, so the browser never derives, re-counts or rounds a
 * reported number. Evidence packs are read through the governed pack RPCs, which
 * return immutable versions. AI narratives are requested from the governed
 * generation service, reviewed through the governed review operation and adopted
 * only after a human decision.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdvisoryInsight, AdvisoryOutput, AdvisoryCitation } from '@/hooks/useConductAdvisory';
import { reviewErrorMessage } from '@/hooks/useConductAdvisory';
import type { ReviewAction, ReportingAdvisoryUseCase } from '@/lib/conductAdvisoryLabels';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  functions: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ scope */

export interface MIScope {
  periodStart: string;
  periodEnd: string;
  sectorId: string | null;
  regulatorId: string | null;
}

const scopeArgs = (s: MIScope) => ({
  _period_start: s.periodStart,
  _period_end: s.periodEnd,
  _sector_id: s.sectorId,
  _regulator_id: s.regulatorId,
});

const scopeKey = (s: MIScope) => [s.periodStart, s.periodEnd, s.sectorId ?? 'all', s.regulatorId ?? 'all'];

/* ------------------------------------------------------------------ types */

export interface MIScopeHeader {
  sectors_in_view: string[];
  sector_scope: 'all_authorised' | 'restricted' | string;
  entity_population: number;
  period_start: string;
  period_end: string;
  report_date: string;
  calculated_at: string;
}

export interface MIDefinition {
  code: string;
  name: string;
  metric_group: string;
  business_meaning: string | null;
  source_object: string | null;
  numerator: string | null;
  denominator: string | null;
  inclusion_criteria: string | null;
  exclusion_criteria: string | null;
  time_basis: string | null;
  grouping_dimensions: string[] | null;
  calculation_note: string | null;
  calculation_version: number | null;
  drilldown_supported: boolean | null;
  effective_from: string | null;
}

export interface MIDashboard {
  scope: MIScopeHeader;
  metrics: Record<string, number>;
  metric_groups: Record<string, Record<string, number>>;
  definitions: MIDefinition[];
  definition_version: string;
  coverage?: Record<string, unknown>;
  facts_signature: string;
  generated_at: string;
  provenance: { source: string; content_class: string; ai_content: boolean };
}

export interface MIDrilldownRecord {
  id: string;
  record_type: string;
  reference: string | null;
  title: string | null;
  sector_id: string | null;
  occurred_at: string | null;
  route: string | null;
  detail: Record<string, unknown> | null;
}

export interface MIDrilldown {
  metric: MIDefinition;
  scope: MIScopeHeader;
  value: number;
  returned: number;
  records: MIDrilldownRecord[];
}

export interface MIComparison {
  code: string;
  name: string;
  metric_group: string;
  current_value: number;
  previous_value: number;
  absolute_change: number;
  percentage_change: number | null;
  interpretation_limited: boolean;
  limitation: string | null;
}

export interface MIPeriodCompare {
  scope: MIScopeHeader;
  current_period: { start: string; end: string; days: number };
  previous_period: { start: string; end: string; days: number };
  comparisons: MIComparison[];
  note: string;
}

export interface MISectorCoverageRow {
  sector_id?: string | null;
  sector_name?: string | null;
  [key: string]: unknown;
}

export interface MICoverageResult<K extends string> {
  scope: MIScopeHeader;
  basis: string;
  generated_at: string;
}

export type MISectorCoverage = MICoverageResult<'sectors'> & { sectors: MISectorCoverageRow[] };
export type MIEntityCoverage = MICoverageResult<'entities'> & { entities: Record<string, unknown>[] };
export type MIRiskReporting = MICoverageResult<'risks'> & { risks: Record<string, unknown>[] };
export type MIOutcomeReporting = MICoverageResult<'interventions'> & { interventions: Record<string, unknown>[] };

export interface EvidencePackSummary {
  id: string;
  reference: string;
  pack_type: string;
  subject_id: string | null;
  subject_label: string | null;
  sector_id: string | null;
  period_start: string | null;
  period_end: string | null;
  current_version: number;
  status: string;
  created_by: string | null;
  created_at: string;
  latest_signature: string | null;
}

export interface EvidencePackVersionSummary {
  version: number;
  generated_at: string;
  generated_by: string | null;
  facts_signature: string;
  regeneration_reason: string | null;
}

export interface EvidencePackRead {
  pack: Omit<EvidencePackSummary, 'created_by' | 'latest_signature'>;
  version: {
    version: number;
    snapshot: Record<string, unknown>;
    metrics: Record<string, unknown>;
    source_record_ids: Record<string, unknown>;
    ai_assistance: Record<string, unknown> | null;
    facts_signature: string;
    definition_version: string | null;
    regeneration_reason: string | null;
    generated_by: string | null;
    generated_at: string;
  };
  versions: EvidencePackVersionSummary[];
}

export interface ReportingNarrativeAdoption {
  id: string;
  section: string;
  adopted_at: string;
  rationale: string;
}

/** A recorded reporting narrative. Shaped so the shared advisory UI can render it. */
export interface ReportingNarrative extends AdvisoryInsight {
  use_case_code: ReportingAdvisoryUseCase;
  sector_id: string | null;
  model_version: string | null;
  adoptions: ReportingNarrativeAdoption[];
}

/* ------------------------------------------------------- deterministic MI */

export function useMIDashboard(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-dashboard', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MIDashboard>('conduct_mi_dashboard', scopeArgs(scope)),
  });
}

export function useMIDrilldown(metricCode: string | null, scope: MIScope) {
  return useQuery({
    queryKey: ['conduct-mi-drilldown', metricCode, ...scopeKey(scope)],
    enabled: Boolean(metricCode),
    retry: false,
    staleTime: 30_000,
    queryFn: () =>
      rpc<MIDrilldown>('conduct_mi_drilldown', { _metric_code: metricCode, ...scopeArgs(scope), _limit: 500 }),
  });
}

export function useMIPeriodCompare(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-compare', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MIPeriodCompare>('conduct_mi_period_compare', scopeArgs(scope)),
  });
}

export function useMISectorCoverage(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-sector-coverage', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MISectorCoverage>('conduct_mi_sector_coverage', scopeArgs(scope)),
  });
}

export function useMIEntityCoverage(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-entity-coverage', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MIEntityCoverage>('conduct_mi_entity_coverage', { ...scopeArgs(scope), _limit: 200 }),
  });
}

export function useMIRiskReporting(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-risk', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MIRiskReporting>('conduct_mi_risk_reporting', scopeArgs(scope)),
  });
}

export function useMIOutcomeReporting(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-mi-outcomes', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<MIOutcomeReporting>('conduct_mi_outcome_reporting', scopeArgs(scope)),
  });
}

/* --------------------------------------------------------- evidence packs */

export function useEvidencePacks(scope: Pick<MIScope, 'sectorId' | 'regulatorId'>, packType: string | null = null) {
  return useQuery({
    queryKey: ['conduct-evidence-packs', packType ?? 'all', scope.sectorId ?? 'all', scope.regulatorId ?? 'all'],
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const data = await rpc<{ packs: EvidencePackSummary[] }>('conduct_evidence_pack_list', {
        _pack_type: packType,
        _subject_id: null,
        _sector_id: scope.sectorId,
        _regulator_id: scope.regulatorId,
        _limit: 200,
      });
      return data?.packs ?? [];
    },
  });
}

export function useEvidencePack(packId: string | null, version: number | null = null) {
  return useQuery({
    queryKey: ['conduct-evidence-pack', packId, version ?? 'current'],
    enabled: Boolean(packId),
    retry: false,
    queryFn: () => rpc<EvidencePackRead>('conduct_evidence_pack_read', { _pack_id: packId, _version: version }),
  });
}

export interface GeneratePackInput {
  packType: string;
  subjectId?: string | null;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  periodStart: string;
  periodEnd: string;
  sectorId?: string | null;
  regulatorId?: string | null;
  regenerationReason?: string | null;
  existingPackId?: string | null;
}

/** Generates a new immutable pack version. The server assembles and signs it. */
export function useGenerateEvidencePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GeneratePackInput) =>
      rpc<Record<string, unknown>>('conduct_evidence_pack_generate', {
        _pack_type: input.packType,
        _subject_id: input.subjectId ?? null,
        _subject_key: input.subjectKey ?? null,
        _subject_label: input.subjectLabel ?? null,
        _period_start: input.periodStart,
        _period_end: input.periodEnd,
        _sector_id: input.sectorId ?? null,
        _regulator_id: input.regulatorId ?? null,
        _regeneration_reason: input.regenerationReason ?? null,
        _existing_pack_id: input.existingPackId ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-evidence-packs'] });
      void qc.invalidateQueries({ queryKey: ['conduct-evidence-pack'] });
    },
  });
}

/** Records that a pack version was exported. Export is an auditable act. */
export function useLogPackExport() {
  return useMutation({
    mutationFn: async (input: { packId: string; version: number; format: string; scope?: Record<string, unknown> }) =>
      rpc<string>('conduct_evidence_pack_export_log', {
        _pack_id: input.packId,
        _version: input.version,
        _format: input.format,
        _scope: input.scope ?? {},
      }),
  });
}

/* ------------------------------------------------------- governed AI layer */

const DENIED = /(out of scope|outside your supervisory remit|not_authori|permission|42501|forbidden)/i;
const FALLBACK =
  'AI narrative assistance is currently unavailable. The management information, drill-down and evidence packs above remain fully available.';

export interface NarrativeRequest {
  useCaseCode: ReportingAdvisoryUseCase;
  packId?: string | null;
  packVersion?: number | null;
}

export type NarrativeResult =
  | { ok: true; insightId: string }
  | { ok: false; state: string; message: string; detail?: string | null };

/**
 * Asks the governed service to draft one narrative. A governance refusal, a
 * rejected ungrounded draft or an unavailable provider all return a safe state —
 * they never throw over the deterministic figures on screen.
 */
export function useGenerateReportingNarrative(scope: MIScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: NarrativeRequest): Promise<NarrativeResult> => {
      const { data, error } = await sb.functions.invoke('conduct-reporting-ai-advise', {
        body: {
          use_case_code: req.useCaseCode,
          period_start: scope.periodStart,
          period_end: scope.periodEnd,
          sector_id: scope.sectorId,
          regulator_id: scope.regulatorId,
          pack_id: req.packId ?? null,
          pack_version: req.packVersion ?? null,
        },
      });
      const payload = (data ?? {}) as Record<string, unknown>;

      if (error && !payload.state) {
        const msg = String((error as { message?: string }).message ?? '');
        return {
          ok: false,
          state: DENIED.test(msg) ? 'DENIED' : 'AI_ASSISTANCE_UNAVAILABLE',
          message: DENIED.test(msg)
            ? 'You are not permitted to prepare AI narrative assistance for this reporting scope.'
            : FALLBACK,
        };
      }
      if (payload.ok !== true) {
        const message = String(payload.message ?? payload.error ?? '');
        return {
          ok: false,
          state: DENIED.test(message) ? 'DENIED' : String(payload.state ?? 'AI_ASSISTANCE_UNAVAILABLE'),
          message: message || FALLBACK,
          detail: payload.detail ? String(payload.detail) : null,
        };
      }
      return { ok: true, insightId: String(payload.conduct_ai_insight_id ?? '') };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-reporting-narratives'] });
    },
  });
}

/** Recorded narratives for the reporting period in view, newest first. */
export function useReportingNarratives(scope: MIScope, enabled = true) {
  return useQuery({
    queryKey: ['conduct-reporting-narratives', ...scopeKey(scope)],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<ReportingNarrative[]> => {
      const data = await rpc<{ narratives: ReportingNarrative[] }>('conduct_reporting_narratives_list', {
        ...scopeArgs(scope),
        _limit: 100,
      });
      return (data?.narratives ?? []).map((row) => ({
        ...row,
        source_references: Array.isArray(row.source_references) ? row.source_references : ([] as AdvisoryCitation[]),
        adoptions: Array.isArray(row.adoptions) ? row.adoptions : [],
      }));
    },
  });
}

/** Records a human review decision against one narrative. */
export function useReviewReportingNarrative(scope: MIScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      insightId: string;
      action: ReviewAction;
      rationale?: string;
      humanText?: string;
    }) => {
      const humanOutput: AdvisoryOutput | null = input.humanText
        ? { advisory_text: input.humanText }
        : null;
      const { data, error } = await sb.rpc('conduct_ai_insight_review', {
        _insight_id: input.insightId,
        _action: input.action,
        _rationale: input.rationale ?? null,
        _human_output: humanOutput,
      });
      if (error) throw new Error(reviewErrorMessage(error.message));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-reporting-narratives', ...scopeKey(scope)] });
    },
  });
}

/** Re-checks, on the server, whether the figures behind a narrative have changed. */
export function useRefreshNarrativeFreshness(scope: MIScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insightId: string) =>
      rpc<Record<string, unknown>>('conduct_reporting_ai_refresh_staleness', { _insight_id: insightId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-reporting-narratives', ...scopeKey(scope)] });
    },
  });
}

/**
 * Adopts a reviewed narrative into a named report section. The server refuses an
 * unreviewed or stale narrative, and the adoption record is append-only.
 */
export function useAdoptReportingNarrative(scope: MIScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      insightId: string;
      section: string;
      rationale: string;
      packId?: string | null;
      packVersion?: number | null;
    }) =>
      rpc<string>('conduct_reporting_narrative_adopt', {
        _insight_id: input.insightId,
        _section: input.section,
        _rationale: input.rationale,
        _pack_id: input.packId ?? null,
        _pack_version: input.packVersion ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-reporting-narratives', ...scopeKey(scope)] });
    },
  });
}
