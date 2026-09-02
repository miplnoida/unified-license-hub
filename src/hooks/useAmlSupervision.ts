/**
 * AML/CFT supervision read hooks.
 *
 * Every read goes through the canonical supervisory spine: the governed
 * read models (`aml_overview_metrics`, `aml_portfolio`, `aml_work_queue`,
 * `aml_entity_panel`) and the canonical stores (`supervisory_assessment`,
 * `supervisory_assessment_dimension`, `supervisory_finding`,
 * `supervisory_remediation_action`, `examinations`). Examinations and
 * findings/remediation are filtered views of those canonical models, never
 * AML-private tables.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export type AmlPortfolioRow = {
  entity_id: string;
  entity_name: string | null;
  sector_name: string | null;
  licence_reference: string | null;
  residual_rating: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  prior_rating: string | null;
  trend: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  assessment_current: boolean | null;
  last_assessment_id: string | null;
  last_assessment_reference: string | null;
  last_assessment_status: string | null;
  methodology_version: string | null;
  assigned_officer_id: string | null;
  assigned_officer_name: string | null;
  assigned_team_id: string | null;
  high_risk_dimensions: string[] | null;
  open_findings: number | null;
  critical_findings: number | null;
  overdue_remediation: number | null;
  active_examinations: number | null;
  reassessment_required: boolean | null;
};

export type AmlWorkQueueRow = {
  kind: string;
  id: string;
  entity_id: string | null;
  title: string | null;
  status: string | null;
  severity: string | null;
  due_at: string | null;
  href: string | null;
};

export function useAmlOverview() {
  return useQuery({
    queryKey: ['aml', 'overview'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_overview_metrics');
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
}

export function useAmlPortfolio(limit = 200) {
  return useQuery({
    queryKey: ['aml', 'portfolio', limit],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_portfolio', { _limit: limit });
      if (error) throw error;
      return (data ?? []) as AmlPortfolioRow[];
    },
  });
}

export function useAmlWorkQueue(limit = 200) {
  return useQuery({
    queryKey: ['aml', 'work-queue', limit],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_work_queue', { _limit: limit });
      if (error) throw error;
      return (data ?? []) as AmlWorkQueueRow[];
    },
  });
}

export function useAmlEntityPanel(entityId?: string) {
  return useQuery({
    queryKey: ['aml', 'entity-panel', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_entity_panel', { _entity_id: entityId });
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
}

async function nameMap(entityIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(entityIds.filter(Boolean))) as string[];
  if (!ids.length) return new Map<string, string>();
  const { data } = await sb.from('licensees').select('id, name').in('id', ids);
  return new Map<string, string>((data ?? []).map((r: any) => [r.id, r.name ?? '']));
}

export function useAmlAssessments() {
  return useQuery({
    queryKey: ['aml', 'assessments'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_assessment')
        .select(
          'id, reference, entity_id, assessment_type, trigger_type, status, period_start, period_end, ' +
            'methodology_version, residual_rating, inherent_rating, control_rating, is_current, ' +
            'owner_id, submitted_at, approved_at, approved_by, confidentiality, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({ ...r, entity_name: names.get(r.entity_id) ?? null }));
    },
  });
}

export function useAmlAssessment(assessmentId?: string) {
  return useQuery({
    queryKey: ['aml', 'assessment', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data: header, error } = await sb
        .from('supervisory_assessment')
        .select('*')
        .eq('id', assessmentId)
        .maybeSingle();
      if (error) throw error;
      if (!header) return null;

      const [{ data: dims }, { data: methodology }, { data: findings }, { data: exams }, { data: attention }] =
        await Promise.all([
          sb
            .from('supervisory_assessment_dimension')
            .select('*')
            .eq('assessment_id', assessmentId)
            .order('dimension_group', { ascending: true })
            .order('dimension_code', { ascending: true }),
          sb
            .from('supervisory_methodology')
            .select('id, code, name, version, status, domain_code')
            .eq('id', header.methodology_id)
            .maybeSingle(),
          sb
            .from('supervisory_finding')
            .select('id, reference, title, severity, status, due_date, examination_id')
            .eq('assessment_id', assessmentId)
            .order('created_at', { ascending: false }),
          sb
            .from('examinations')
            .select('id, reference, title, stage, examination_type, fieldwork_start, fieldwork_end')
            .eq('domain_code', 'AML_CFT')
            .eq('entity_id', header.entity_id)
            .order('created_at', { ascending: false })
            .limit(20),
          sb
            .from('supervisory_attention_origin')
            .select('attention_id, assessment_dimension_id, signal_id')
            .eq('assessment_id', assessmentId),
        ]);

      const names = await nameMap([header.entity_id]);
      const attentionIds = Array.from(
        new Set((attention ?? []).map((a: any) => a.attention_id).filter(Boolean)),
      ) as string[];
      let attentionRows: any[] = [];
      let plans: any[] = [];
      if (attentionIds.length) {
        const [{ data: att }, { data: pl }] = await Promise.all([
          sb
            .from('supervisory_attention')
            .select('id, reference, title, materiality, urgency, status, confirmed_priority')
            .in('id', attentionIds),
          sb
            .from('supervisory_plan')
            .select('id, reference, title, status, priority, attention_id')
            .in('attention_id', attentionIds),
        ]);
        attentionRows = att ?? [];
        plans = pl ?? [];
      }

      const { data: history } = await sb
        .from('supervisory_assessment_event')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: true });

      return {
        header: { ...header, entity_name: names.get(header.entity_id) ?? null },
        dimensions: dims ?? [],
        methodology: methodology ?? null,
        findings: findings ?? [],
        examinations: exams ?? [],
        attention: attentionRows,
        plans,
        history: history ?? [],
      };
    },
  });
}

export function useAmlExaminations() {
  return useQuery({
    queryKey: ['aml', 'examinations'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('examinations')
        .select(
          'id, reference, title, entity_id, engagement_type, examination_type, stage, risk_rating, ' +
            'fieldwork_start, fieldwork_end, lead_examiner_id, closed_at, intervention_id, ' +
            'reassessment_required, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({ ...r, entity_name: names.get(r.entity_id) ?? null }));
    },
  });
}

export function useAmlFindings() {
  return useQuery({
    queryKey: ['aml', 'findings'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_finding')
        .select(
          'id, reference, title, entity_id, finding_category, severity, status, response_state, ' +
            'due_date, response_target_date, assessment_id, examination_id, confidentiality, ' +
            'issued_at, closed_at, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const findingIds = (data ?? []).map((r: any) => r.id);
      let actions: any[] = [];
      if (findingIds.length) {
        const { data: ra } = await sb
          .from('supervisory_remediation_action')
          .select('id, reference, finding_id, description, status, target_date, effectiveness, escalated_attention_id')
          .in('finding_id', findingIds);
        actions = ra ?? [];
      }
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({
        ...r,
        entity_name: names.get(r.entity_id) ?? null,
        remediation: actions.filter((a) => a.finding_id === r.id),
      }));
    },
  });
}
