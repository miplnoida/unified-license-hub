import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Data access for Administration → Regulatory Operating Structure.
 *
 * Every WRITE goes through an existing governed SECURITY DEFINER routine
 * (`assign_entity_supervision`, `transfer_entity_supervision`,
 * `end_entity_supervision_assignment`, `appeal_independence_policy_set`,
 * `fp_committee_*`). There is no direct DML on the operating-structure tables
 * from the client — `authenticated` holds no write grant on them.
 *
 * A person may legitimately appear in several teams, functions, panels and
 * committees; nothing here filters a user out for organisational overlap.
 */
const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase.rpc as any)(name, args ?? {});
  if (error) throw error;
  const payload = data as any;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error) {
    throw new Error(String(payload.error));
  }
  return payload as T;
};

const table = async (name: string, cols: string, order?: string) => {
  let q = (supabase.from(name as any) as any).select(cols);
  if (order) q = q.order(order);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
};

export function useRegulators() {
  return useQuery({
    queryKey: ['os-regulators'],
    queryFn: () => table('regulators', 'id, code, name, description, status', 'name'),
  });
}

/**
 * Regulators that may be linked to NEW structure. Inactive / retired regulators
 * remain readable for history but are never offered for a new responsibility,
 * team or assignment.
 */
export function useActiveRegulators() {
  const all = useRegulators();
  return {
    ...all,
    data: (all.data || []).filter((r: any) => String(r.status || '').toLowerCase() === 'active'),
  };
}


export function useRegulatoryFunctions() {
  return useQuery({
    queryKey: ['os-functions'],
    queryFn: () => table('regulatory_functions', 'id, key, name, module_key, status', 'sort_order'),
  });
}

export function useRegulatoryTeams() {
  return useQuery({
    queryKey: ['os-teams'],
    queryFn: () =>
      table(
        'regulatory_teams',
        'id, code, name, team_type, status, regulator_id, regulatory_function_id, effective_from, effective_to',
        'name',
      ),
  });
}

export function useRegulatorMandates() {
  return useQuery({
    queryKey: ['os-mandates'],
    queryFn: async () => ({
      mandates: await table(
        'regulator_mandates',
        'id, regulator_id, regulatory_function_id, sector_id, sub_sector_id, responsibility_type, status',
      ),
      enforcement: await table('regulator_mandate_enforcement', 'id, regulator_id, regulatory_function_id, enforcement_status'),
    }),
  });
}

export function useSupervisedEntities() {
  return useQuery({
    queryKey: ['os-entities'],
    queryFn: () => table('licensees', 'id, name, sector_id, sub_sector_id, status', 'name'),
  });
}

export function useStaffProfiles() {
  return useQuery({
    queryKey: ['os-staff'],
    queryFn: () => table('profiles', 'id, full_name, email', 'full_name'),
  });
}

export interface SupervisionAssignment {
  id: string;
  entity_id: string;
  regulator_id: string | null;
  regulatory_function_id: string | null;
  team_id: string | null;
  lead_supervisor_user_id: string | null;
  alternate_supervisor_user_id: string | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  requires_admin_review: boolean | null;
  assignment_reason: string | null;
  closure_reason: string | null;
  is_primary: boolean | null;
  supervisory_cycle: string | null;
}

export function useSupervisionAssignments() {
  return useQuery({
    queryKey: ['os-supervision'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('entity_supervision_assignments' as any) as any)
        .select(
          'id, entity_id, regulator_id, regulatory_function_id, team_id, lead_supervisor_user_id, alternate_supervisor_user_id, status, effective_from, effective_to, requires_admin_review, assignment_reason, closure_reason, is_primary, supervisory_cycle',
        )
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data || []) as SupervisionAssignment[];
    },
  });
}

/** Team memberships, used to show eligible staff for a team without excluding multi-team people. */
export function useTeamMembers() {
  return useQuery({
    queryKey: ['os-team-members'],
    queryFn: () =>
      table(
        'regulatory_team_members',
        'id, team_id, user_id, member_role, status, effective_from, effective_to',
      ),
  });
}

export function useSupervisionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['os-supervision'] });
    qc.invalidateQueries({ queryKey: ['regulatory-coverage-warnings'] });
    qc.invalidateQueries({ queryKey: ['staff-responsibility-profile'] });
  };

  const assign = useMutation({
    mutationFn: (v: {
      entityId: string;
      regulatorId: string;
      functionId: string;
      teamId?: string | null;
      leadUserId?: string | null;
      alternateUserId?: string | null;
      reason?: string | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    }) =>
      rpc('assign_entity_supervision', {
        _entity_id: v.entityId,
        _regulator_id: v.regulatorId,
        _regulatory_function_id: v.functionId,
        _team_id: v.teamId || null,
        _lead_supervisor_user_id: v.leadUserId || null,
        _alternate_supervisor_user_id: v.alternateUserId || null,
        _assignment_reason: v.reason || null,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
        _effective_to: v.effectiveTo || null,
      }),
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: (v: {
      assignmentId: string;
      teamId?: string | null;
      leadUserId?: string | null;
      alternateUserId?: string | null;
      reason?: string | null;
      effectiveFrom?: string | null;
    }) =>
      rpc('transfer_entity_supervision', {
        _assignment_id: v.assignmentId,
        _team_id: v.teamId || null,
        _lead_supervisor_user_id: v.leadUserId || null,
        _alternate_supervisor_user_id: v.alternateUserId || null,
        _transfer_reason: v.reason || null,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });

  const end = useMutation({
    mutationFn: (v: { assignmentId: string; reason: string; effectiveTo?: string | null }) =>
      rpc('end_entity_supervision_assignment', {
        _assignment_id: v.assignmentId,
        _closure_reason: v.reason,
        _effective_to: v.effectiveTo || new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });

  return { assign, transfer, end };
}

/* ---------------------------------- panels --------------------------------- */

export function useAppealIndependencePolicies() {
  return useQuery({
    queryKey: ['os-appeal-independence'],
    queryFn: () =>
      table(
        'appeal_independence_policies',
        'id, regulator_id, appeal_scope, prior_decision_maker_may_sit, legal_adviser_votes, notes, updated_at',
      ),
  });
}

export function useAppealIndependenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      appealScope: string;
      priorDecisionMakerMaySit: boolean;
      legalAdviserVotes: boolean;
      regulatorId?: string | null;
      notes?: string | null;
    }) =>
      rpc('appeal_independence_policy_set', {
        _appeal_scope: v.appealScope,
        _prior_decision_maker_may_sit: v.priorDecisionMakerMaySit,
        _legal_adviser_votes: v.legalAdviserVotes,
        _regulator_id: v.regulatorId || null,
        _notes: v.notes || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['os-appeal-independence'] }),
  });
}

export function useFpCommittees() {
  return useQuery({
    queryKey: ['os-fp-committees'],
    queryFn: async () => ({
      committees: await table(
        'fp_committees',
        'id, name, description, regulator_id, quorum, approval_threshold_pct, is_active, casting_vote_member_id',
        'name',
      ),
      members: await table('fp_committee_members', 'id, committee_id, user_id, member_role, is_active, vote_weight'),
    }),
  });
}

export function useAppealPanelsWithMembers() {
  return useQuery({
    queryKey: ['os-appeal-panels'],
    queryFn: async () => ({
      panels: await table(
        'license_appeal_panels',
        'id, name, description, regulator_id, appeal_scope, is_active, quorum, decision_rule, effective_from, effective_to',
        'name',
      ),
      members: await table(
        'license_appeal_panel_members',
        'id, panel_id, user_id, member_role, is_chair, is_voting, is_active, effective_from, effective_to',
      ),
    }),
  });
}

/* ------------------------------- role registry ----------------------------- */

/** Expected canonical role keys that the seed could not find in the live registry. */
export const EXPECTED_ROLE_KEYS = ['licensing_analyst', 'f_p_assessor'];

export function useRoleRegistryDrift() {
  return useQuery({
    queryKey: ['os-role-drift'],
    queryFn: async () => {
      const rows = await table('sec_roles', 'id, key, name, status');
      const live = new Set(rows.map((r) => r.key));
      return {
        missing: EXPECTED_ROLE_KEYS.filter((k) => !live.has(k)),
        total: rows.length,
      };
    },
  });
}

/* ------------------------- configuration console data ---------------------- */

export function useSectors() {
  return useQuery({
    queryKey: ['os-sectors'],
    queryFn: () =>
      table('sectors', 'id, name, code, display_group, scope_note, external_regulator, regulator_id, status', 'name'),
  });
}

export function useSubSectors() {
  return useQuery({
    queryKey: ['os-sub-sectors'],
    queryFn: () => table('sub_sectors', 'id, name, code, sector_id, status', 'name'),
  });
}

/** Display order for the regulator's operating universe. Grouping is presentational only. */
export const SECTOR_GROUP_ORDER: string[] = [
  'DOMESTIC_FINANCIAL_SECTOR',
  'INTERNATIONAL_FINANCIAL_SECTOR',
  'OTHER_NEW_REGULATED_SECTOR',
];

export const SECTOR_GROUP_LABELS: Record<string, string> = {
  DOMESTIC_FINANCIAL_SECTOR: 'Domestic Financial Sector',
  INTERNATIONAL_FINANCIAL_SECTOR: 'International Financial Sector',
  OTHER_NEW_REGULATED_SECTOR: 'Other / New Regulated Sector',
  UNGROUPED: 'Other regulated sectors',
};

const isActive = (row: any) => String(row?.status || '').toLowerCase() === 'active';

/** Sectors offered in normal coverage / responsibility flows — active only. */
export function useActiveSectors() {
  const all = useSectors();
  return { ...all, data: (all.data || []).filter(isActive) };
}

/** Sub-sectors offered in normal flows — active, and only under an active sector. */
export function useActiveSubSectors() {
  const all = useSubSectors();
  const sectors = useActiveSectors();
  const ids = new Set((sectors.data || []).map((s: any) => s.id));
  return { ...all, data: (all.data || []).filter((s: any) => isActive(s) && ids.has(s.sector_id)) };
}

/** Active sectors arranged into the regulator's display groups. */
export function useGroupedActiveSectors() {
  const sectors = useActiveSectors();
  const groups = [...SECTOR_GROUP_ORDER, 'UNGROUPED'].map((key) => ({
    key,
    label: SECTOR_GROUP_LABELS[key],
    sectors: (sectors.data || []).filter(
      (s: any) => (s.display_group || 'UNGROUPED') === key,
    ),
  }));
  return { ...sectors, groups: groups.filter((g) => g.sectors.length > 0) };
}


export function useStaffPortfolios() {
  return useQuery({
    queryKey: ['os-portfolios'],
    queryFn: async () => ({
      portfolios: await table(
        'staff_portfolios',
        'id, user_id, regulator_id, regulatory_function_id, team_id, status, effective_from, effective_to, notes',
      ),
      scopes: await table('staff_portfolio_scopes', 'id, portfolio_id, scope_kind, sector_id, sub_sector_id, entity_id'),
    }),
  });
}

export function useTeamMandateLinks() {
  return useQuery({
    queryKey: ['os-team-mandates'],
    queryFn: () => table('regulatory_team_mandates', 'id, team_id, regulator_mandate_id, is_primary, effective_to'),
  });
}

const invalidateStructure = (qc: ReturnType<typeof useQueryClient>) => {
  ['os-teams', 'os-team-members', 'os-team-mandates', 'os-portfolios', 'os-mandates',
   'regulatory-coverage-warnings', 'staff-responsibility-profile', 'staff-responsibility-directory',
  ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
};

/** Teams: create / update / activate / deactivate and membership management. */
export function useTeamMutations() {
  const qc = useQueryClient();
  const done = () => invalidateStructure(qc);

  const saveTeam = useMutation({
    mutationFn: (v: {
      id?: string | null; regulatorId: string; code: string; name: string; teamType: string;
      functionId?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null; status?: string;
    }) =>
      rpc('regulatory_team_upsert', {
        _regulator_id: v.regulatorId,
        _code: v.code,
        _name: v.name,
        _team_type: v.teamType,
        _regulatory_function_id: v.functionId || null,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
        _effective_to: v.effectiveTo || null,
        _status: v.status || 'active',
        _id: v.id || null,
      }),
    onSuccess: done,
  });

  const setTeamStatus = useMutation({
    mutationFn: (v: { teamId: string; status: string }) =>
      rpc('regulatory_team_set_status', { _team_id: v.teamId, _status: v.status }),
    onSuccess: done,
  });

  const saveMember = useMutation({
    mutationFn: (v: {
      id?: string | null; teamId: string; userId: string; memberRole: string;
      effectiveFrom?: string | null; effectiveTo?: string | null;
    }) =>
      rpc('regulatory_team_member_set', {
        _team_id: v.teamId,
        _user_id: v.userId,
        _member_role: v.memberRole,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
        _effective_to: v.effectiveTo || null,
        _id: v.id || null,
      }),
    onSuccess: done,
  });

  const endMember = useMutation({
    mutationFn: (v: { membershipId: string; effectiveTo?: string | null }) =>
      rpc('regulatory_team_member_end', {
        _membership_id: v.membershipId,
        _effective_to: v.effectiveTo || new Date().toISOString(),
      }),
    onSuccess: done,
  });

  const addTeamMandate = useMutation({
    mutationFn: (v: { teamId: string; mandateId: string; isPrimary?: boolean }) =>
      rpc('regulatory_team_mandate_add', {
        _team_id: v.teamId,
        _regulator_mandate_id: v.mandateId,
        _is_primary: !!v.isPrimary,
      }),
    onSuccess: done,
  });

  const endTeamMandate = useMutation({
    mutationFn: (v: { id: string }) => rpc('regulatory_team_mandate_end', { _id: v.id }),
    onSuccess: done,
  });

  return { saveTeam, setTeamStatus, saveMember, endMember, addTeamMandate, endTeamMandate };
}

/** Staff functional responsibilities (portfolios) and the places they apply. */
export function usePortfolioMutations() {
  const qc = useQueryClient();
  const done = () => invalidateStructure(qc);

  const savePortfolio = useMutation({
    mutationFn: (v: {
      id?: string | null; userId: string; regulatorId: string; functionId: string;
      teamId?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null;
      status?: string; notes?: string | null;
    }) =>
      rpc('staff_portfolio_upsert', {
        _user_id: v.userId,
        _regulator_id: v.regulatorId,
        _regulatory_function_id: v.functionId,
        _team_id: v.teamId || null,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
        _effective_to: v.effectiveTo || null,
        _status: v.status || 'active',
        _notes: v.notes || null,
        _id: v.id || null,
      }),
    onSuccess: done,
  });

  const endPortfolio = useMutation({
    mutationFn: (v: { portfolioId: string; effectiveTo?: string | null }) =>
      rpc('staff_portfolio_end', {
        _portfolio_id: v.portfolioId,
        _effective_to: v.effectiveTo || new Date().toISOString(),
      }),
    onSuccess: done,
  });

  const addScope = useMutation({
    mutationFn: (v: {
      portfolioId: string; scopeKind: 'sector' | 'sub_sector' | 'entity';
      sectorId?: string | null; subSectorId?: string | null; entityId?: string | null;
    }) =>
      rpc('staff_portfolio_scope_add', {
        _portfolio_id: v.portfolioId,
        _scope_kind: v.scopeKind,
        _sector_id: v.sectorId || null,
        _sub_sector_id: v.subSectorId || null,
        _entity_id: v.entityId || null,
      }),
    onSuccess: done,
  });

  const removeScope = useMutation({
    mutationFn: (v: { scopeId: string }) => rpc('staff_portfolio_scope_remove', { _scope_id: v.scopeId }),
    onSuccess: done,
  });

  /**
   * Atomic multi-area save. One governed portfolio per selected regulatory
   * function — never an array of functions inside one portfolio. Either every
   * requested responsibility is written or none is.
   */
  const batchSaveResponsibilities = useMutation({
    mutationFn: (v: { userId: string; items: Record<string, unknown>[]; dryRun?: boolean }) =>
      rpc('staff_responsibilities_batch_save', {
        _user_id: v.userId,
        _items: v.items,
        _dry_run: !!v.dryRun,
      }),
    onSuccess: done,
  });

  return { savePortfolio, endPortfolio, addScope, removeScope, batchSaveResponsibilities };
}

/** Regulator mandates: what this regulator is responsible for, and where it is enforced. */
export function useMandateMutations() {
  const qc = useQueryClient();
  const done = () => invalidateStructure(qc);

  const saveMandate = useMutation({
    mutationFn: (v: {
      id?: string | null; regulatorId: string; functionId: string; responsibilityType: string;
      sectorId?: string | null; subSectorId?: string | null; status?: string; notes?: string | null;
      effectiveFrom?: string | null; effectiveTo?: string | null;
    }) =>
      rpc('regulator_mandate_upsert', {
        _regulator_id: v.regulatorId,
        _regulatory_function_id: v.functionId,
        _responsibility_type: v.responsibilityType,
        _sector_id: v.sectorId || null,
        _sub_sector_id: v.subSectorId || null,
        _effective_from: v.effectiveFrom || new Date().toISOString(),
        _effective_to: v.effectiveTo || null,
        _status: v.status || 'active',
        _notes: v.notes || null,
        _id: v.id || null,
      }),
    onSuccess: done,
  });

  const setMandateStatus = useMutation({
    mutationFn: (v: { mandateId: string; status: string }) =>
      rpc('regulator_mandate_set_status', { _mandate_id: v.mandateId, _status: v.status }),
    onSuccess: done,
  });

  const setEnforcement = useMutation({
    mutationFn: (v: { regulatorId: string; functionId: string; status: 'DRAFT' | 'ACTIVE'; notes?: string | null }) =>
      rpc('regulator_mandate_enforcement_set', {
        _regulator_id: v.regulatorId,
        _regulatory_function_id: v.functionId,
        _enforcement_status: v.status,
        _notes: v.notes || null,
      }),
    onSuccess: done,
  });

  return { saveMandate, setMandateStatus, setEnforcement };
}

/**
 * Internal-staff directory via the governed read model. Preferred over a direct
 * `profiles` read because row-level security narrows `profiles` for most staff,
 * which would otherwise show colleagues as "Unknown user".
 */
export function useStaffDirectory() {
  return useQuery({
    queryKey: ['staff-responsibility-directory'],
    queryFn: async () => {
      const rows = await rpc<any[]>('staff_responsibility_directory');
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: r.user_id as string,
        full_name: (r.full_name || r.email || 'Unknown user') as string,
        email: (r.email || null) as string | null,
      }));
    },
  });
}

/* ------------------------- coverage / decision bodies ---------------------- */

export interface CoverageWarning {
  code: string;
  severity: string;
  subject_type: string;
  subject_id: string | null;
  subject: string;
  detail: string;
}

export function useCoverageWarnings() {
  return useQuery({
    queryKey: ['regulatory-coverage-warnings'],
    queryFn: async () => {
      const rows = await rpc<CoverageWarning[]>('regulatory_coverage_warnings');
      return (Array.isArray(rows) ? rows : []) as CoverageWarning[];
    },
  });
}

const invalidateBodies = (qc: ReturnType<typeof useQueryClient>) => {
  ['os-appeal-panels', 'os-fp-committees', 'regulatory-coverage-warnings',
   'staff-responsibility-profile'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
};

/** Appeal panels and their membership — governed routines only. */
export function useAppealPanelMutations() {
  const qc = useQueryClient();
  const done = () => invalidateBodies(qc);

  const createPanel = useMutation({
    mutationFn: (v: {
      name: string; appealScope: string; quorum: number; decisionRule: string;
      regulatorId?: string | null; description?: string | null;
    }) =>
      rpc('appeal_panel_create', {
        _name: v.name,
        _appeal_scope: v.appealScope,
        _quorum: v.quorum,
        _decision_rule: v.decisionRule,
        _regulator_id: v.regulatorId || null,
        _description: v.description || null,
      }),
    onSuccess: done,
  });

  const updatePanel = useMutation({
    mutationFn: (v: {
      panelId: string; name?: string | null; appealScope?: string | null; quorum?: number | null;
      decisionRule?: string | null; description?: string | null; isActive?: boolean | null;
    }) =>
      rpc('appeal_panel_update', {
        _panel_id: v.panelId,
        _name: v.name ?? null,
        _appeal_scope: v.appealScope ?? null,
        _quorum: v.quorum ?? null,
        _decision_rule: v.decisionRule ?? null,
        _description: v.description ?? null,
        _is_active: v.isActive ?? null,
      }),
    onSuccess: done,
  });

  const addMember = useMutation({
    mutationFn: (v: { panelId: string; userId: string; memberRole: string; isVoting: boolean }) =>
      rpc('appeal_panel_member_add', {
        _panel_id: v.panelId,
        _user_id: v.userId,
        _member_role: v.memberRole,
        _is_voting: v.isVoting,
      }),
    onSuccess: done,
  });

  const updateMember = useMutation({
    mutationFn: (v: { memberId: string; memberRole?: string | null; isVoting?: boolean | null }) =>
      rpc('appeal_panel_member_update', {
        _member_id: v.memberId,
        _member_role: v.memberRole ?? null,
        _is_voting: v.isVoting ?? null,
      }),
    onSuccess: done,
  });

  const endMember = useMutation({
    mutationFn: (v: { memberId: string }) => rpc('appeal_panel_member_end', { _member_id: v.memberId }),
    onSuccess: done,
  });

  return { createPanel, updatePanel, addMember, updateMember, endMember };
}

/** Fit & Proper committees and their membership — governed routines only. */
export function useFpCommitteeMutations() {
  const qc = useQueryClient();
  const done = () => invalidateBodies(qc);

  const createCommittee = useMutation({
    mutationFn: (v: {
      name: string; quorum: number; approvalThresholdPct: number;
      description?: string | null; regulatorId?: string | null;
    }) =>
      rpc('fp_committee_create', {
        _name: v.name,
        _quorum: v.quorum,
        _approval_threshold_pct: v.approvalThresholdPct,
        _description: v.description || null,
        _regulator_id: v.regulatorId || null,
      }),
    onSuccess: done,
  });

  const updateCommittee = useMutation({
    mutationFn: (v: {
      committeeId: string; name?: string | null; quorum?: number | null;
      approvalThresholdPct?: number | null; isActive?: boolean | null; description?: string | null;
    }) =>
      rpc('fp_committee_update', {
        _committee_id: v.committeeId,
        _name: v.name ?? null,
        _quorum: v.quorum ?? null,
        _approval_threshold_pct: v.approvalThresholdPct ?? null,
        _description: v.description ?? null,
        _is_active: v.isActive ?? null,
      }),
    onSuccess: done,
  });

  const addMember = useMutation({
    mutationFn: (v: { committeeId: string; userId: string; memberRole: string }) =>
      rpc('fp_committee_member_add', {
        _committee_id: v.committeeId,
        _user_id: v.userId,
        _member_role: v.memberRole,
      }),
    onSuccess: done,
  });

  const setMemberActive = useMutation({
    mutationFn: (v: { memberId: string; isActive: boolean }) =>
      rpc('fp_committee_member_set_active', { _member_id: v.memberId, _is_active: v.isActive }),
    onSuccess: done,
  });

  return { createCommittee, updateCommittee, addMember, setMemberActive };
}
