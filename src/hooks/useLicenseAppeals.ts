import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { licenseAppealFile, licenseAppealWithdraw, licenseAppealAcknowledge } from '@/lib/supervisoryGovernedOps';

export interface LicenseAppeal {
  id: string;
  appeal_reference: string;
  application_id: string;
  license_id: string | null;
  licensee_id: string | null;
  regulator_id: string | null;
  filed_by: string;
  filed_at: string;
  appeal_deadline: string | null;
  grounds: string;
  relief_sought: string | null;
  status: string;
  panel_id: string | null;
  assigned_to: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  hearing_date: string | null;
  hearing_format: string | null;
  hearing_venue: string | null;
  hearing_link: string | null;
  hearing_notes: string | null;
  hearing_completed_at: string | null;
  case_file_ready_at: string | null;
  quorum_met: boolean | null;
  dissent_note: string | null;
  decision_conditions: string | null;
  decision: string | null;
  decision_rationale: string | null;
  decided_at: string | null;
  decided_by: string | null;
  supporting_docs: unknown;
  created_at: string;
  updated_at: string;
}

export interface LicenseAppealEvent {
  id: string;
  appeal_id: string;
  event_type: string;
  description: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AppealHearingFormat = 'written' | 'oral' | 'virtual' | 'in_person';
export type AppealDecisionRule = 'majority' | 'unanimous' | 'chair_casting';

export interface LicenseAppealPanel {
  id: string;
  name: string;
  description: string | null;
  regulator_id: string | null;
  is_active: boolean;
  appeal_scope: string;
  effective_from: string | null;
  effective_to: string | null;
  default_hearing_format: AppealHearingFormat;
  quorum: number;
  decision_rule: AppealDecisionRule;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseAppealPanelMember {
  id: string;
  panel_id: string;
  user_id: string;
  member_role: 'chair' | 'member' | 'legal_adviser' | 'observer';
  is_chair: boolean;
  is_voting: boolean;
  vote_weight: number;
  regulator_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppealPanelSnapshotMember {
  member_id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  member_role: string;
  is_chair: boolean;
  is_voting: boolean;
  vote_weight: number;
}

export interface LicenseAppealPanelSnapshot {
  id: string;
  appeal_id: string;
  panel_id: string;
  panel_name: string;
  appeal_scope: string;
  quorum: number;
  decision_rule: AppealDecisionRule;
  hearing_format: string | null;
  member_roster: AppealPanelSnapshotMember[];
  snapshot_by: string | null;
  snapshot_at: string;
}

export interface AppealCaseFileItem {
  key: string;
  label: string;
  required: boolean;
  satisfied: boolean;
}

export interface AppealCaseFileStatus {
  appeal_id?: string;
  items: AppealCaseFileItem[];
  blocking_count: number;
  ready: boolean;
  error?: string;
}

export interface AppealScope {
  id: string;
  scope_key: string;
  label: string;
  is_active: boolean;
}

const APPEALS_KEY = 'license-appeals';

interface RpcResult {
  success?: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

/** Calls a SECURITY DEFINER appeal routine; envelope errors become thrown errors. */
async function callAppealRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  const result = (data as unknown as RpcResult | null) ?? {};
  if (result.error) throw new Error(String(result.error));
  return result;
}

/** Appeals lodged against a single application (RLS scopes visibility). */
export function useApplicationAppeals(applicationId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'by-application', applicationId],
    queryFn: async (): Promise<LicenseAppeal[]> => {
      const { data, error } = await supabase
        .from('license_appeals')
        .select('*')
        .eq('application_id', applicationId!)
        .order('filed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LicenseAppeal[];
    },
    enabled: !!applicationId,
    staleTime: 30_000,
  });
}

/** Full appeal register (regulator) or the caller's own appeals (applicant). */
export function useLicenseAppeals(filters?: { status?: string; search?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [APPEALS_KEY, 'list', filters],
    queryFn: async (): Promise<LicenseAppeal[]> => {
      let q = supabase.from('license_appeals').select('*').order('filed_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as unknown as LicenseAppeal[];
      const term = filters?.search?.trim().toLowerCase();
      if (term) {
        rows = rows.filter(
          (r) =>
            r.appeal_reference.toLowerCase().includes(term) ||
            (r.grounds || '').toLowerCase().includes(term),
        );
      }
      return rows;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useLicenseAppeal(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'one', appealId],
    queryFn: async (): Promise<LicenseAppeal | null> => {
      const { data, error } = await supabase
        .from('license_appeals')
        .select('*')
        .eq('id', appealId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LicenseAppeal) ?? null;
    },
    enabled: !!appealId,
  });
}

/** Status of the application an appeal was lodged against (used to offer a reopen retry). */
export function useAppealApplicationStatus(applicationId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'application-status', applicationId],
    queryFn: async (): Promise<{ status: string; application_number: string } | null> => {
      const { data, error } = await supabase
        .from('applications')
        .select('status, application_number')
        .eq('id', applicationId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { status: string; application_number: string } | null) ?? null;
    },
    enabled: !!applicationId,
    staleTime: 10_000,
  });
}

export function useLicenseAppealEvents(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'events', appealId],
    queryFn: async (): Promise<LicenseAppealEvent[]> => {
      const { data, error } = await supabase
        .from('license_appeal_events')
        .select('*')
        .eq('appeal_id', appealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealEvent[];
    },
    enabled: !!appealId,
    staleTime: 15_000,
  });
}

export function useAppealScopes() {
  return useQuery({
    queryKey: [APPEALS_KEY, 'scopes'],
    queryFn: async (): Promise<AppealScope[]> => {
      const { data, error } = await supabase
        .from('appeal_panel_scopes')
        .select('*')
        .eq('is_active', true)
        .order('label');
      if (error) throw error;
      return (data || []) as unknown as AppealScope[];
    },
    staleTime: 300_000,
  });
}

export function useLicenseAppealPanels(activeOnly = false) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'panels', activeOnly],
    queryFn: async (): Promise<LicenseAppealPanel[]> => {
      let q = supabase.from('license_appeal_panels').select('*').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealPanel[];
    },
    staleTime: 120_000,
  });
}

/** Current (live) composition of a panel. */
export function useLicenseAppealPanelMembers(panelId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'panel-members', panelId],
    queryFn: async (): Promise<LicenseAppealPanelMember[]> => {
      const { data, error } = await supabase
        .from('license_appeal_panel_members')
        .select('*')
        .eq('panel_id', panelId!)
        .order('is_chair', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealPanelMember[];
    },
    enabled: !!panelId,
    staleTime: 30_000,
  });
}

/** Live composition of every panel — used to summarise membership in the panel list. */
export function useAllLicenseAppealPanelMembers() {
  return useQuery({
    queryKey: [APPEALS_KEY, 'panel-members', 'all'],
    queryFn: async (): Promise<LicenseAppealPanelMember[]> => {
      const { data, error } = await supabase
        .from('license_appeal_panel_members')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealPanelMember[];
    },
    staleTime: 30_000,
  });
}

/** The composition photographed for this appeal — never changes when the panel changes. */


export function useAppealPanelSnapshot(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'panel-snapshot', appealId],
    queryFn: async (): Promise<LicenseAppealPanelSnapshot | null> => {
      const { data, error } = await supabase
        .from('license_appeal_panel_snapshots')
        .select('*')
        .eq('appeal_id', appealId!)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LicenseAppealPanelSnapshot) ?? null;
    },
    enabled: !!appealId,
    staleTime: 30_000,
  });
}

export function useAppealCaseFile(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'case-file', appealId],
    queryFn: async (): Promise<AppealCaseFileStatus | null> => {
      const { data, error } = await supabase.rpc(
        'appeal_case_file_status' as never,
        { _appeal_id: appealId } as never,
      );
      if (error) throw error;
      return (data as unknown as AppealCaseFileStatus) ?? null;
    },
    enabled: !!appealId,
    staleTime: 15_000,
  });
}

export interface ReinstateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  application_number?: string;
  status?: string;
}

/** Calls the reopen-after-appeal routine and turns its result into a thrown error or a value. */
async function runReinstate(appealId: string, remarks: string): Promise<ReinstateResult> {
  const { data, error } = await supabase.rpc(
    'reinstate_application_after_appeal' as never,
    { _appeal_id: appealId, _remarks: remarks } as never,
  );
  if (error) throw error;
  const result = (data as unknown as ReinstateResult | null) ?? {};
  if (result.error) throw new Error(result.error);
  return result;
}

async function logEvent(appealId: string, eventType: string, description: string, actorId?: string | null) {
  await supabase.from('license_appeal_events').insert({
    appeal_id: appealId,
    event_type: eventType,
    description,
    actor_id: actorId ?? null,
  } as never);
}

export function useLicenseAppealMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [APPEALS_KEY] });
  const invalidateApplication = () => {
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    queryClient.invalidateQueries({ queryKey: ['application'] });
    queryClient.invalidateQueries({ queryKey: ['workflow-instance'] });
  };

  const lodgeAppeal = useMutation({
    mutationFn: async (input: {
      applicationId: string;
      licenseeId?: string | null;
      regulatorId?: string | null;
      grounds: string;
      reliefSought?: string;
      appealDeadline?: string | null;
    }) => {
      const appeal = (await licenseAppealFile({
        application_id: input.applicationId,
        licensee_id: input.licenseeId ?? null,
        regulator_id: input.regulatorId ?? null,
        grounds: input.grounds,
        relief_sought: input.reliefSought || null,
        appeal_deadline: input.appealDeadline ?? null,
      })) as unknown as LicenseAppeal;
      return appeal;
    },
    onSuccess: invalidate,
  });

  const withdrawAppeal = useMutation({
    mutationFn: async (appealId: string) => {
      await licenseAppealWithdraw(appealId, 'Appeal withdrawn by the appellant');
    },
    onSuccess: invalidate,
  });

  const acknowledgeAppeal = useMutation({
    mutationFn: async (appeal: LicenseAppeal) => {
      await licenseAppealAcknowledge(appeal.id);
    },
    onSuccess: invalidate,
  });

  /** Constitutes the panel for this appeal and photographs its composition. */
  const assignPanel = useMutation({
    mutationFn: async (input: {
      appealId: string;
      panelId: string;
      hearingDate?: string | null;
      hearingFormat?: string | null;
    }) =>
      callAppealRpc('assign_appeal_panel', {
        _appeal_id: input.appealId,
        _panel_id: input.panelId,
        _hearing_date: input.hearingDate || null,
        _hearing_format: input.hearingFormat || null,
      }),
    onSuccess: invalidate,
  });

  const scheduleHearing = useMutation({
    mutationFn: async (input: {
      appealId: string;
      hearingDate: string;
      hearingFormat: AppealHearingFormat;
      venue?: string | null;
      link?: string | null;
      reason?: string | null;
    }) =>
      callAppealRpc('schedule_appeal_hearing', {
        _appeal_id: input.appealId,
        _hearing_date: input.hearingDate,
        _hearing_format: input.hearingFormat,
        _venue: input.venue || null,
        _link: input.link || null,
        _reason: input.reason || null,
      }),
    onSuccess: invalidate,
  });

  const completeHearing = useMutation({
    mutationFn: async (input: { appealId: string; minutes: string; amend?: boolean }) =>
      callAppealRpc('complete_appeal_hearing', {
        _appeal_id: input.appealId,
        _minutes: input.minutes,
        _amend: input.amend ?? false,
      }),
    onSuccess: invalidate,
  });


  const recordDecision = useMutation({
    mutationFn: async (input: {
      appeal: LicenseAppeal;
      decision: string;
      rationale: string;
      dissent?: string | null;
      conditions?: string | null;
    }): Promise<ReinstateResult | null> => {
      const result = await callAppealRpc('record_appeal_decision', {
        _appeal_id: input.appeal.id,
        _decision: input.decision,
        _rationale: input.rationale,
        _dissent: input.dissent || null,
        _conditions: input.conditions || null,
      });
      return (result.reinstatement as ReinstateResult | null) ?? null;
    },
    onSuccess: () => {
      invalidate();
      invalidateApplication();
    },
  });

  /** Retry the reopen step for an appeal that was already accepted. */
  const reinstateApplication = useMutation({
    mutationFn: async (input: { appeal: LicenseAppeal }) =>
      runReinstate(input.appeal.id, input.appeal.decision_rationale || ''),
    onSuccess: () => {
      invalidate();
      invalidateApplication();
    },
  });

  /**
   * Panel configuration is governed: direct DML on license_appeal_panels and
   * license_appeal_panel_members is revoked, so every change goes through the
   * checked routines (permission, active staff, single chair, duplicate member,
   * observers never vote, quorum feasibility reported back).
   */
  const savePanel = useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      description?: string;
      is_active: boolean;
      appeal_scope: string;
      regulator_id?: string | null;
      effective_from?: string | null;
      effective_to?: string | null;
      default_hearing_format: AppealHearingFormat;
      quorum: number;
      decision_rule: AppealDecisionRule;
      notes?: string | null;
    }) => {
      if (input.id) {
        const { data, error } = await supabase.rpc('appeal_panel_update', {
          _panel_id: input.id,
          _name: input.name,
          _appeal_scope: input.appeal_scope,
          _quorum: input.quorum,
          _decision_rule: input.decision_rule,
          _default_hearing_format: input.default_hearing_format,
          _regulator_id: input.regulator_id || null,
          _description: input.description || null,
          _effective_from: input.effective_from || null,
          _effective_to: input.effective_to || null,
          _is_active: input.is_active,
          _notes: input.notes || null,
          _clear_regulator: !input.regulator_id,
        } as never);
        if (error) throw error;
        void data;
        return input.id;
      }
      const { data, error } = await supabase.rpc('appeal_panel_create', {
        _name: input.name,
        _appeal_scope: input.appeal_scope,
        _quorum: input.quorum,
        _decision_rule: input.decision_rule,
        _default_hearing_format: input.default_hearing_format,
        _regulator_id: input.regulator_id || null,
        _description: input.description || null,
        _effective_from: input.effective_from || null,
        _effective_to: input.effective_to || null,
        _is_active: input.is_active,
        _notes: input.notes || null,
      } as never);
      if (error) throw error;
      return (data as { id: string } | null)?.id as string;
    },
    onSuccess: invalidate,
  });

  const savePanelMember = useMutation({
    mutationFn: async (input: {
      id?: string;
      panel_id: string;
      user_id: string;
      member_role: LicenseAppealPanelMember['member_role'];
      is_voting: boolean;
      vote_weight: number;
      effective_from?: string | null;
      effective_to?: string | null;
      is_active: boolean;
    }) => {
      if (input.id) {
        const { error } = await supabase.rpc('appeal_panel_member_update', {
          _member_id: input.id,
          _member_role: input.member_role,
          _is_voting: input.is_voting,
          _vote_weight: input.vote_weight,
          _effective_from: input.effective_from || null,
          _effective_to: input.effective_to || null,
          _is_active: input.is_active,
        } as never);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc('appeal_panel_member_add', {
        _panel_id: input.panel_id,
        _user_id: input.user_id,
        _member_role: input.member_role,
        _is_voting: input.is_voting,
        _vote_weight: input.vote_weight,
        _effective_from: input.effective_from || null,
        _effective_to: input.effective_to || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Members are stood down rather than deleted so historical snapshots stay explainable. */
  const standDownPanelMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('appeal_panel_member_end', {
        _member_id: memberId,
        _effective_to: new Date().toISOString().slice(0, 10),
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });


  return {
    lodgeAppeal, withdrawAppeal, acknowledgeAppeal, assignPanel,
    scheduleHearing, completeHearing, recordDecision, reinstateApplication,
    savePanel, savePanelMember, standDownPanelMember,
  };
}
