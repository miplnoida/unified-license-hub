/**
 * RDM-ENTITY-001 Wave A — registry / resolution / membership data hooks.
 * Thin TanStack wrappers over the governed gateway service.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as registry from '@/services/entityRegistry';

const db = () => supabase as unknown as { from: (t: string) => any };

export function useEntitySearch(query: string) {
  return useQuery({
    queryKey: ['entity-registry-search', query],
    queryFn: () => registry.searchEntities(query),
    staleTime: 30_000,
  });
}

export function useEntityDto(entityId: string | null | undefined) {
  return useQuery({
    queryKey: ['entity-registry-dto', entityId],
    enabled: !!entityId,
    queryFn: () => registry.getEntity(entityId!),
  });
}

export interface ResolutionCaseRow {
  id: string;
  case_number: string;
  status: string;
  outcome: string | null;
  subject_name: string;
  provider_status: string;
  authority_mode: string;
  resolved_entity_id: string | null;
  application_id: string | null;
  decision_notes: string | null;
  requested_at: string;
  resolved_at: string | null;
  created_at: string;
}

/**
 * Canonical supervisory queue. Reads the governed `entity_resolution_queue`
 * read model so escalated rows carry recommendation, recommending officer and
 * escalation age without any client-side table access.
 */
export function useResolutionQueue(status?: string) {
  return useQuery({
    queryKey: ['entity-resolution-queue', status ?? 'all'],
    queryFn: () => registry.getResolutionQueue(status),
    staleTime: 15_000,
  });
}

/** Legacy shape kept for callers that only need the raw case list. */
export function useResolutionCases(status?: string) {
  const q = useResolutionQueue(status);
  return { ...q, data: (q.data?.rows ?? []) as unknown as ResolutionCaseRow[] };
}

export function useResolutionCase(caseId: string | null) {
  return useQuery({
    queryKey: ['entity-resolution-case', caseId],
    enabled: !!caseId,
    queryFn: () => registry.getResolutionCaseView(caseId!),
  });
}


export function useResolutionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['entity-resolution-cases'] });
    qc.invalidateQueries({ queryKey: ['entity-resolution-case'] });
    qc.invalidateQueries({ queryKey: ['entity-registry-search'] });
  };

  return {
    resolveIdentity: useMutation({ mutationFn: registry.resolveIdentity, onSuccess: invalidate }),
    decide: useMutation({ mutationFn: registry.decideResolution, onSuccess: invalidate }),
    previewMerge: useMutation({
      mutationFn: (v: { survivorEntityId: string; absorbedEntityId: string }) =>
        registry.previewMerge(v.survivorEntityId, v.absorbedEntityId),
    }),
    executeMerge: useMutation({ mutationFn: registry.executeMerge, onSuccess: invalidate }),
  };
}

export interface MembershipRow {
  id: string;
  user_id: string;
  entity_id: string;
  membership_role_id: string;
  status: string;
  authority_evidence_reference: string | null;
  requested_at: string;
  approved_at: string | null;
  revocation_reason: string | null;
}

export function useMembershipRoles() {
  return useQuery({
    queryKey: ['entity-membership-roles'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('entity_membership_roles')
        .select('id, key, label, description, is_primary_representative, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as Array<{
        id: string; key: string; label: string; description: string | null;
        is_primary_representative: boolean; sort_order: number;
      }>;
    },
  });
}

export function useMemberships(opts?: { status?: string; entityId?: string; userId?: string }) {
  return useQuery({
    queryKey: ['entity-memberships', opts?.status ?? 'all', opts?.entityId ?? '-', opts?.userId ?? '-'],
    queryFn: async (): Promise<MembershipRow[]> => {
      let q = db().from('entity_user_memberships').select('*').order('requested_at', { ascending: false }).limit(300);
      if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
      if (opts?.entityId) q = q.eq('entity_id', opts.entityId);
      if (opts?.userId) q = q.eq('user_id', opts.userId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as MembershipRow[];
    },
  });
}

export function useMembershipMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['entity-memberships'] });
    qc.invalidateQueries({ queryKey: ['sec-context'] });
  };
  return {
    request: useMutation({
      mutationFn: (v: { entityId: string; roleKey: string; evidenceRef?: string }) =>
        registry.requestMembership(v.entityId, v.roleKey, v.evidenceRef),
      onSuccess: invalidate,
    }),
    verify: useMutation({
      mutationFn: (v: { id: string; notes?: string }) => registry.verifyMembership(v.id, v.notes),
      onSuccess: invalidate,
    }),
    approve: useMutation({ mutationFn: (id: string) => registry.approveMembership(id), onSuccess: invalidate }),
    reject: useMutation({
      mutationFn: (v: { id: string; reason: string }) => registry.rejectMembership(v.id, v.reason),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (v: { id: string; reason: string }) => registry.revokeMembership(v.id, v.reason),
      onSuccess: invalidate,
    }),
  };
}
