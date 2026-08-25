/**
 * RDM-ENTITY-001 Wave C (external) — data hooks for "My Organisation →
 * Returns": the regulated-entity side of the canonical returns workspace.
 *
 * Every write still goes through a governed SECURITY DEFINER RPC (see
 * useWaveC.ts). This file adds:
 *   - membership-derived entity + capability resolution for the CURRENT user
 *   - an entity returns summary read
 *   - a governed helper to persist a form response and attach it to a
 *     filing requirement in one step
 *
 * Capabilities are derived from `entity_membership_role_permissions` for the
 * user's APPROVED membership on the SELECTED entity — never from role-name
 * string matching — so the same user can be a Filing User on one entity and
 * a Viewer on another.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { EntityCalendarRow, FilingDetail } from '@/hooks/useWaveC';

const db = () => supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

const KEY = ['entity-returns'] as const;

// Re-export the canonical Wave C row/detail shapes so callers only need one
// import when working in the entity-facing screens.
export type { EntityCalendarRow, FilingDetail };

/* ------------------------------------------------------------------ */
/* Membership + capability model                                       */
/* ------------------------------------------------------------------ */

export const RETURNS_CAPABILITIES = ['view_status', 'prepare_filing', 'submit', 'upload_documents', 'respond_rfi', 'pay', 'manage_users'] as const;
export type ReturnsCapability = typeof RETURNS_CAPABILITIES[number];

export interface ApprovedMembership {
  membership_id: string;
  entity_id: string;
  entity_name: string;
  role_id: string;
  role_key: string;
  role_label: string;
  is_primary_representative: boolean;
  capabilities: ReturnsCapability[];
}

/** The current user's APPROVED entity memberships, each with its resolved capabilities. */
export function useMyApprovedMemberships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'my-memberships', user?.id ?? null],
    enabled: !!user?.id,
    queryFn: async (): Promise<ApprovedMembership[]> => {
      const { data, error } = await db()
        .from('entity_user_memberships')
        .select(`
          id, entity_id, status, effective_to,
          licensees:entity_id ( name ),
          entity_membership_roles:membership_role_id (
            id, key, label, is_primary_representative,
            entity_membership_role_permissions ( capability )
          )
        `)
        .eq('user_id', user!.id)
        .eq('status', 'APPROVED');
      if (error) throw new Error(error.message);
      const now = Date.now();
      return (data ?? [])
        .filter((row: any) => !row.effective_to || new Date(row.effective_to).getTime() > now)
        .map((row: any): ApprovedMembership => {
          const role = row.entity_membership_roles ?? {};
          const perms: ReturnsCapability[] = (role.entity_membership_role_permissions ?? [])
            .map((p: any) => p.capability as ReturnsCapability);
          // A primary representative implicitly holds every capability
          // (mirrors public.entity_membership_capability's server-side rule).
          const capabilities = role.is_primary_representative
            ? [...RETURNS_CAPABILITIES]
            : perms;
          return {
            membership_id: row.id,
            entity_id: row.entity_id,
            entity_name: row.licensees?.name ?? 'Entity',
            role_id: role.id,
            role_key: role.key,
            role_label: role.label,
            is_primary_representative: !!role.is_primary_representative,
            capabilities,
          };
        });
    },
    staleTime: 30_000,
  });
}

export interface EntityCapabilities {
  canView: boolean;
  canOpenOrEdit: boolean;
  canValidate: boolean;
  canSubmit: boolean;
  canRespondToRequest: boolean;
  isViewer: boolean;
}

/**
 * Resolve capability flags for a given entity from the caller's approved memberships.
 *
 * Mirrors the server split between `returns_can_prepare` (open/edit a filing) and
 * `returns_can_file` (submit it): a Preparer holds `prepare_filing` only and must
 * still be able to open and work a filing, while submission stays `submit`-only.
 */
export function useEntityCapabilities(entityId?: string | null): EntityCapabilities {
  const { data: memberships } = useMyApprovedMemberships();
  return useMemo(() => {
    const membership = (memberships ?? []).find((m) => m.entity_id === entityId);
    const has = (c: ReturnsCapability) => !!membership?.capabilities.includes(c);
    const canSubmit = has('submit');
    const canOpenOrEdit = canSubmit || has('prepare_filing');
    return {
      canView: !!membership,
      canOpenOrEdit,
      canValidate: canOpenOrEdit,
      canSubmit,
      canRespondToRequest: canOpenOrEdit || has('respond_rfi'),
      isViewer: !!membership && !canOpenOrEdit && !has('respond_rfi'),
    };
  }, [memberships, entityId]);
}

/* ------------------------------------------------------------------ */
/* Entity summary + calendar reads                                     */
/* ------------------------------------------------------------------ */

export interface EntityReturnsSummary {
  entity_id: string;
  active_obligations: number;
  next_due: { definition_code: string; definition_name: string; period_label: string; due_date: string } | null;
  overdue_count: number;
  correction_requested_count: number;
  recent_filings: Array<{
    filing_id: string; filing_reference: string; status: string; current_version_number: number;
    definition_code: string; definition_name: string; period_label: string; period_end: string;
    due_date: string; submitted_at: string | null;
  }>;
  latest_accepted_metrics: Array<{
    code: string; name: string; unit: string | null; value_numeric: number | null;
    availability: string; period_label: string; period_end: string;
  }>;
}

export function useEntityReturnsSummary(entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'summary', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityReturnsSummary>('returns_entity_summary', { _entity_id: entityId }),
    staleTime: 15_000,
  });
}

export function useCalendarFormsProgress(versionIds: string[]) {
  const key = versionIds.filter(Boolean).sort().join(',');
  return useQuery({
    queryKey: [...KEY, 'calendar-progress', key],
    enabled: versionIds.length > 0,
    queryFn: async (): Promise<Record<string, { completed: number; required: number }>> => {
      const ids = versionIds.filter(Boolean);
      if (ids.length === 0) return {};
      const { data, error } = await db()
        .from('return_filing_form_requirements')
        .select('return_filing_version_id, is_required, completion_status')
        .in('return_filing_version_id', ids);
      if (error) throw new Error(error.message);
      const out: Record<string, { completed: number; required: number }> = {};
      for (const row of (data ?? []) as Array<{ return_filing_version_id: string; is_required: boolean; completion_status: string }>) {
        const bucket = out[row.return_filing_version_id] ?? { completed: 0, required: 0 };
        if (row.is_required) {
          bucket.required += 1;
          if (row.completion_status === 'COMPLETED') bucket.completed += 1;
        }
        out[row.return_filing_version_id] = bucket;
      }
      return out;
    },
    staleTime: 15_000,
  });
}

export function useEntityReturnsCalendar(entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'calendar', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityCalendarRow[]>('returns_entity_calendar', { _entity_id: entityId }),
    staleTime: 15_000,
  });
}

export function useEntityFilingDetail(filingId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'filing-detail', filingId],
    enabled: !!filingId,
    queryFn: () => rpc<FilingDetail>('returns_filing_detail', { _filing_id: filingId }),
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

export function useEntityReturnsMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  return {
    openFiling: useMutation({
      mutationFn: (periodId: string) =>
        rpc<{ filing_id: string; filing_reference: string; version_id: string }>(
          'returns_open_filing', { _period_id: periodId }),
      onSuccess: invalidate,
    }),

    /**
     * Persist a `form_responses` row for the EXACT pinned `form_version_id`
     * on a filing requirement, then attach it via the governed RPC. Never
     * writes to `return_filing_form_requirements` directly.
     */
    saveFormResponse: useMutation({
      mutationFn: async (v: {
        requirementId: string;
        templateId: string;
        formVersionId: string;
        existingResponseId: string | null;
        data: Record<string, unknown>;
        completion?: 'IN_PROGRESS' | 'COMPLETED';
      }) => {
        if (!user?.id) throw new Error('Not authenticated');
        let responseId = v.existingResponseId;
        if (responseId) {
          const { error } = await db().from('form_responses').update({
            version_id: v.formVersionId,
            user_id: user.id,
            response_data: v.data,
            status: 'draft',
          }).eq('id', responseId);
          if (error) throw new Error(error.message);
        } else {
          const { data: inserted, error } = await db().from('form_responses').insert({
            template_id: v.templateId,
            version_id: v.formVersionId,
            user_id: user.id,
            response_data: v.data,
            status: 'draft',
            entity_type: 'return_filing_requirement',
            entity_id: v.requirementId,
          }).select('id').single();
          if (error) throw new Error(error.message);
          responseId = inserted!.id;
        }
        await rpc('returns_attach_form_response', {
          _requirement_id: v.requirementId,
          _form_response_id: responseId,
          _completion: v.completion ?? 'COMPLETED',
        });
        return { responseId };
      },
      onSuccess: invalidate,
    }),

    validateFiling: useMutation({
      mutationFn: (versionId: string) =>
        rpc<{ errors: number; warnings: number; can_submit: boolean }>(
          'returns_validate_filing', { _version_id: versionId }),
      onSuccess: invalidate,
    }),

    submitFiling: useMutation({
      mutationFn: (v: { versionId: string; declarationAccepted: boolean }) =>
        rpc<{ submitted: boolean; validation: { errors: number; warnings: number; can_submit: boolean } }>(
          'returns_submit_filing', {
            _version_id: v.versionId, _declaration_accepted: v.declarationAccepted,
          }),
      onSuccess: invalidate,
    }),

    respondToRequest: useMutation({
      mutationFn: (v: { requestId: string; response: string }) =>
        rpc('returns_respond_to_request', { _request_id: v.requestId, _response: v.response }),
      onSuccess: invalidate,
    }),
  };
}
