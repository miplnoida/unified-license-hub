import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { examinationCreate, examinationUpdate } from '@/lib/supervisoryGovernedOps';

const sb = supabase as any;

export type ExaminationStage =
  | 'planned'
  | 'scoping'
  | 'pre_exam_request'
  | 'fieldwork'
  | 'exit_meeting'
  | 'draft_report'
  | 'management_response'
  | 'final_report'
  | 'remediation'
  | 'closed'
  | 'cancelled';

export const EXAMINATION_STAGES: { value: ExaminationStage; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'scoping', label: 'Scoping' },
  { value: 'pre_exam_request', label: 'Pre-exam request' },
  { value: 'fieldwork', label: 'Fieldwork' },
  { value: 'exit_meeting', label: 'Exit meeting' },
  { value: 'draft_report', label: 'Draft report' },
  { value: 'management_response', label: 'Management response' },
  { value: 'final_report', label: 'Final report' },
  { value: 'remediation', label: 'Remediation' },
  { value: 'closed', label: 'Closed' },
];

export const EXAMINATION_TYPES = [
  { value: 'full_scope', label: 'Full scope' },
  { value: 'targeted', label: 'Targeted' },
  { value: 'thematic', label: 'Thematic' },
  { value: 'follow_up', label: 'Follow-up' },
];

export const TEAM_ROLES = [
  { value: 'lead_examiner', label: 'Lead examiner' },
  { value: 'examiner', label: 'Examiner' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'observer', label: 'Observer' },
];

export const stageLabel = (stage?: string | null) =>
  EXAMINATION_STAGES.find(s => s.value === stage)?.label ??
  (stage === 'cancelled' ? 'Cancelled' : stage ?? '—');

/** Human-readable error mapping for the database guardrails. */
export function examinationErrorMessage(err: any): string {
  const raw = String(err?.message ?? err ?? '');
  if (raw.includes('scoping_memo_not_approved')) return 'The scoping memo must be approved before fieldwork can start.';
  if (raw.includes('lead_examiner_not_assigned')) return 'Assign a lead examiner before starting fieldwork.';
  if (raw.includes('workpapers_pending_review')) return 'Every workpaper needs reviewer sign-off before the final report.';
  if (raw.includes('findings_without_remediation')) return 'All open findings need a remediation action before the final report.';
  if (raw.includes('open_remediation_actions')) return 'The examination cannot close while remediation actions remain open.';
  if (raw.includes('workpaper_reviewer_must_differ_from_preparer')) return 'A workpaper cannot be reviewed by the person who prepared it.';
  if (raw.includes('report_approver_must_differ_from_preparer')) return 'A report cannot be approved by the person who prepared it.';
  if (raw.includes('remediation_already_linked')) return 'This finding already has a remediation action.';
  if (raw.includes('workpaper_not_prepared')) return 'Sign off as preparer before review.';
  if (raw.includes('invalid_stage_transition')) return 'That stage change is not allowed from the current stage.';
  if (raw.includes('not_authorised')) return 'You do not have permission to perform this action.';
  return raw || 'Action failed';
}

// ─── Register ───
export interface ExaminationRow {
  id: string;
  reference: string;
  entity_id: string;
  title: string;
  examination_type: string;
  stage: ExaminationStage;
  risk_rating: string | null;
  fieldwork_start: string | null;
  fieldwork_end: string | null;
  lead_examiner_id: string | null;
  created_at: string;
  licensee?: { name: string | null } | null;
  findings_count?: number;
  open_remediation_count?: number;
}

export function useExaminations(filters?: { entity_id?: string; stage?: string; examination_type?: string }) {
  return useQuery({
    queryKey: ['examinations', filters ?? {}],
    queryFn: async (): Promise<ExaminationRow[]> => {
      let q = sb.from('examinations').select('*').order('created_at', { ascending: false });
      if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
      if (filters?.stage) q = q.eq('stage', filters.stage);
      if (filters?.examination_type) q = q.eq('examination_type', filters.examination_type);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ExaminationRow[];
      if (!rows.length) return rows;

      const entityIds = Array.from(new Set(rows.map(r => r.entity_id).filter(Boolean)));
      const examIds = rows.map(r => r.id);
      const [licRes, findRes] = await Promise.all([
        entityIds.length ? sb.from('licensees').select('id, name').in('id', entityIds) : Promise.resolve({ data: [] }),
        sb.from('examination_findings').select('id, examination_id, status, remediation_action_id').in('examination_id', examIds),
      ]);
      const names = new Map<string, { name: string | null }>((licRes.data ?? []).map((l: any) => [l.id, { name: l.name }]));
      const findings = (findRes.data ?? []) as any[];
      return rows.map(r => ({
        ...r,
        licensee: names.get(r.entity_id) ?? null,
        findings_count: findings.filter(f => f.examination_id === r.id).length,
        open_remediation_count: findings.filter(
          f => f.examination_id === r.id && f.status !== 'closed' && f.remediation_action_id,
        ).length,
      }));
    },
    staleTime: 30_000,
  });
}

export function useExamination(id?: string) {
  return useQuery({
    queryKey: ['examination', id],
    queryFn: async () => {
      const { data, error } = await sb.from('examinations').select('*').eq('id', id).single();
      if (error) throw error;
      let licensee: any = null;
      if (data?.entity_id) {
        const { data: l } = await sb.from('licensees').select('id, name').eq('id', data.entity_id).maybeSingle();
        licensee = l ?? null;
      }
      return { ...data, licensee };
    },
    enabled: !!id,
  });
}

export function useCreateExamination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return await examinationCreate(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examinations'] });
      toast.success('Examination created');
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

export function useUpdateExamination(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      return await examinationUpdate(id, updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination', examinationId] });
      qc.invalidateQueries({ queryKey: ['examinations'] });
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

export function useTransitionExamination(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ to_stage, notes }: { to_stage: ExaminationStage; notes?: string }) => {
      const { data, error } = await sb.rpc('examination_transition_stage', {
        _examination_id: examinationId,
        _to_stage: to_stage,
        _notes: notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['examination', examinationId] });
      qc.invalidateQueries({ queryKey: ['examination-events', examinationId] });
      qc.invalidateQueries({ queryKey: ['examinations'] });
      toast.success(`Moved to ${stageLabel(v.to_stage)}`);
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

// ─── Generic child-table helpers ───
function childQuery<T = any>(table: string, key: string, examinationId?: string, orderBy = 'created_at') {
  return {
    queryKey: [key, examinationId],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await sb.from(table).select('*').eq('examination_id', examinationId).order(orderBy);
      if (error) throw error;
      return (data ?? []) as T[];
    },
    enabled: !!examinationId,
  };
}

function useChildMutations(table: string, keys: string[], examinationId?: string) {
  const qc = useQueryClient();
  const invalidate = () => keys.forEach(k => qc.invalidateQueries({ queryKey: [k, examinationId] }));
  const save = useMutation({
    mutationFn: async ({ id, ...values }: Record<string, any>) => {
      const payload = { ...values, examination_id: examinationId };
      const { data, error } = id
        ? await sb.from(table).update(values).eq('id', id).select().single()
        : await sb.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Saved'); },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Removed'); },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
  return { save, remove };
}

// Scoping
export function useExaminationScoping(examinationId?: string) {
  return useQuery({
    queryKey: ['examination-scoping', examinationId],
    queryFn: async () => {
      const { data, error } = await sb.from('examination_scoping').select('*').eq('examination_id', examinationId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!examinationId,
  });
}
export function useSaveScoping(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { data: existing } = await sb.from('examination_scoping').select('id').eq('examination_id', examinationId).maybeSingle();
      const { data, error } = existing?.id
        ? await sb.from('examination_scoping').update(values).eq('id', existing.id).select().single()
        : await sb.from('examination_scoping').insert({ ...values, examination_id: examinationId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination-scoping', examinationId] });
      toast.success('Scoping memo saved');
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

// Team
export function useExaminationTeam(examinationId?: string) {
  return useQuery(childQuery('examination_team_members', 'examination-team', examinationId));
}
/**
 * Case-team administration is governed: direct DML on examination_team_members is
 * revoked, so members are added, re-roled and ended through the checked routines
 * (examination authority, entity scope, real staff account, one lead examiner,
 * no duplicate membership). A member may always declare their own conflict.
 */
export function useTeamMutations(examinationId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['examination-team', examinationId] });
    qc.invalidateQueries({ queryKey: ['examination-events', examinationId] });
  };
  const save = useMutation({
    mutationFn: async ({ id, ...v }: Record<string, any>) => {
      if (id) {
        const { data, error } = await sb.rpc('examination_team_member_update', {
          _member_id: id,
          _team_role: v.team_role ?? null,
          _allocated_days: v.allocated_days ?? null,
          _specialisation: v.specialisation ?? null,
          _conflict_declared: v.conflict_declared ?? null,
          _conflict_notes: v.conflict_notes ?? null,
        } as never);
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.rpc('examination_team_member_add', {
        _examination_id: examinationId as string,
        _user_id: v.user_id,
        _team_role: v.team_role,
        _allocated_days: v.allocated_days ?? null,
        _specialisation: v.specialisation ?? null,
        _conflict_declared: v.conflict_declared ?? false,
        _conflict_notes: v.conflict_notes ?? null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Saved'); },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc('examination_team_member_end', { _member_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Removed'); },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
  return { save, remove };
}


// Data requests
export function useDataRequests(examinationId?: string) {
  return useQuery(childQuery('examination_data_requests', 'examination-data-requests', examinationId, 'item_no'));
}
export function useDataRequestMutations(examinationId?: string) {
  return useChildMutations('examination_data_requests', ['examination-data-requests'], examinationId);
}

// Workpapers
export function useWorkpapers(examinationId?: string) {
  return useQuery(childQuery('examination_workpapers', 'examination-workpapers', examinationId));
}
export function useWorkpaperMutations(examinationId?: string) {
  return useChildMutations('examination_workpapers', ['examination-workpapers'], examinationId);
}
export function useSignoffWorkpaper(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workpaper_id, role, notes }: { workpaper_id: string; role: 'preparer' | 'reviewer'; notes?: string }) => {
      const { data, error } = await sb.rpc('examination_signoff_workpaper', {
        _workpaper_id: workpaper_id,
        _role: role,
        _notes: notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['examination-workpapers', examinationId] });
      qc.invalidateQueries({ queryKey: ['examination-events', examinationId] });
      toast.success(v.role === 'reviewer' ? 'Reviewer sign-off recorded' : 'Preparer sign-off recorded');
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

// Exit meeting
export function useExitMeeting(examinationId?: string) {
  return useQuery({
    queryKey: ['examination-exit-meeting', examinationId],
    queryFn: async () => {
      const { data, error } = await sb.from('examination_exit_meetings').select('*').eq('examination_id', examinationId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!examinationId,
  });
}
export function useSaveExitMeeting(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { data: existing } = await sb.from('examination_exit_meetings').select('id').eq('examination_id', examinationId).maybeSingle();
      const { data, error } = existing?.id
        ? await sb.from('examination_exit_meetings').update(values).eq('id', existing.id).select().single()
        : await sb.from('examination_exit_meetings').insert({ ...values, examination_id: examinationId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination-exit-meeting', examinationId] });
      toast.success('Exit meeting record saved');
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

// Reports
export function useExaminationReports(examinationId?: string) {
  return useQuery(childQuery('examination_reports', 'examination-reports', examinationId));
}
export function useReportMutations(examinationId?: string) {
  return useChildMutations('examination_reports', ['examination-reports'], examinationId);
}

// Findings
export function useExaminationFindings(examinationId?: string) {
  return useQuery({
    queryKey: ['examination-findings', examinationId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('examination_findings')
        .select('*')
        .eq('examination_id', examinationId)
        .order('created_at');
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const actionIds = rows.map(r => r.remediation_action_id).filter(Boolean);
      if (!actionIds.length) return rows.map(r => ({ ...r, action: null }));
      const { data: actions } = await sb
        .from('prudential_actions')
        .select('id, title, status, due_date, assigned_to, entity_contact, completion_notes')
        .in('id', actionIds);
      const map = new Map((actions ?? []).map((a: any) => [a.id, a]));
      return rows.map(r => ({ ...r, action: r.remediation_action_id ? map.get(r.remediation_action_id) ?? null : null }));
    },
    enabled: !!examinationId,
  });
}
export function useFindingMutations(examinationId?: string) {
  return useChildMutations('examination_findings', ['examination-findings'], examinationId);
}
export function useCreateRemediationAction(examinationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { finding_id: string; due_date?: string | null; entity_contact?: string | null; description?: string | null }) => {
      const { data, error } = await sb.rpc('examination_create_remediation_action', {
        _finding_id: v.finding_id,
        _due_date: v.due_date ?? null,
        _assigned_to: null,
        _entity_contact: v.entity_contact ?? null,
        _description: v.description ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination-findings', examinationId] });
      qc.invalidateQueries({ queryKey: ['examination-events', examinationId] });
      toast.success('Remediation action created');
    },
    onError: (e: any) => toast.error(examinationErrorMessage(e)),
  });
}

// Events
export function useExaminationEvents(examinationId?: string) {
  return useQuery({
    queryKey: ['examination-events', examinationId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('examination_events')
        .select('*')
        .eq('examination_id', examinationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!examinationId,
  });
}
