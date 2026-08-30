/**
 * F8A-B4 — data hooks for the canonical address primitive, deterministic
 * common-address intelligence and the projection queue.
 *
 * Every protected read and every mutation goes through the governed SECURITY
 * DEFINER RPCs (`address_360_overview`, `address_common_matches`,
 * `relationship_intelligence_search`, `address_projection_queue`,
 * `person_address_intelligence`, `address_usage_propose|approve|end`,
 * `address_project_sources`). Subject address usages are read through the
 * RLS-governed `address_usages` view of the same primitive — the client never
 * writes to `addresses` or `address_usages` (browser DML is revoked) and
 * performs no normalization, matching or identity logic of its own.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  from: (table: string) => any;
};

/** Classified failure modes — a B4 screen must never show these as "no records". */
export type B4FailureKind =
  | 'UNAUTHORIZED'
  | 'OUT_OF_SCOPE'
  | 'NOT_FOUND'
  | 'CONTRACT_MISSING'
  | 'INVALID_INPUT'
  | 'BACKEND_ERROR';

export interface B4Failure extends Error {
  kind: B4FailureKind;
}

export function classifyB4Error(input: unknown): B4Failure {
  const raw = input instanceof Error ? input.message : String(input ?? 'Unknown error');
  const msg = raw.toUpperCase();
  let kind: B4FailureKind = 'BACKEND_ERROR';

  if (msg.includes('ADDRESS_AUTH_REQUIRED') || msg.includes('JWT') || msg.includes('NOT AUTHENTICATED')) {
    kind = 'UNAUTHORIZED';
  } else if (msg.includes('ADDRESS_PERMISSION_DENIED') || msg.includes('PERMISSION DENIED')) {
    kind = 'UNAUTHORIZED';
  } else if (msg.includes('ADDRESS_SCOPE_DENIED')) {
    kind = 'OUT_OF_SCOPE';
  } else if (msg.includes('ADDRESS_NOT_FOUND') || msg.includes('ADDRESS_USAGE_NOT_FOUND')) {
    kind = 'NOT_FOUND';
  } else if (
    msg.includes('DOES NOT EXIST')
    || msg.includes('COULD NOT FIND THE FUNCTION')
    || msg.includes('SCHEMA CACHE')
    || msg.includes('PGRST202')
    || msg.includes('PGRST205')
  ) {
    kind = 'CONTRACT_MISSING';
  } else if (
    msg.includes('INTELLIGENCE_QUERY_TOO_SHORT')
    || msg.includes('ADDRESS_INVALID')
    || msg.includes('ADDRESS_SUBJECT_NOT_FOUND')
  ) {
    kind = 'INVALID_INPUT';
  }

  const err = new Error(raw) as B4Failure;
  err.kind = kind;
  return err;
}

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw classifyB4Error(error.message ?? error);
  return data as T;
}

/* --------------------------------------------------------------- types */

export interface AddressCore {
  id: string;
  country_code: string;
  admin_area: string | null;
  locality: string | null;
  postal_code: string | null;
  street_line1: string;
  street_line2: string | null;
  unit: string | null;
  normalized_key: string;
  normalization_version: number;
}

export interface AddressOccupant {
  match_class: 'EXACT' | 'NORMALIZED';
  address_id: string;
  subject_kind: 'ENTITY' | 'PERSON' | 'ESTABLISHMENT';
  subject_id: string;
  subject_name: string | null;
  usage_type: string;
  approval_status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  effective_from: string;
  effective_to: string | null;
  source_kind: string;
}

export interface Address360 {
  address: AddressCore;
  as_of: string;
  occupants: AddressOccupant[];
  occupant_count: number;
  scope_note: string;
}

export interface IntelligenceHit {
  result_kind: 'ENTITY' | 'PERSON' | 'ADDRESS';
  result_id: string;
  title: string | null;
  subtitle: string | null;
  detail: string | null;
}

export interface ProjectionQueueRow {
  source_kind: string;
  source_id: string;
  subject_label: string | null;
  reason: 'UNRESOLVED_PERSON_IDENTITY' | 'UNBOUND_REGISTRATION' | string;
  address_preview: string | null;
}

export interface PersonAddressUsage {
  usage_id: string;
  address_id: string;
  address_line: string;
  usage_type: string;
  approval_status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  effective_from: string;
  effective_to: string | null;
  source_kind: string;
  co_occupants: number;
}

export interface PersonAddressIntelligence {
  party_id: string;
  as_of: string;
  addresses: PersonAddressUsage[];
}

export interface SubjectAddressUsage {
  id: string;
  address_id: string;
  usage_type: string;
  approval_status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  effective_from: string;
  effective_to: string | null;
  source_kind: string;
  source_detail: string | null;
  approved_at: string | null;
  verified_at: string | null;
  addresses: AddressCore | null;
}

/* --------------------------------------------------------------- reads */

export function useAddress360(addressId?: string, asOf?: string) {
  return useQuery<Address360>({
    queryKey: ['address-360', addressId, asOf ?? 'current'],
    enabled: !!addressId,
    retry: 0,
    queryFn: () => rpc<Address360>('address_360_overview', {
      _address_id: addressId,
      ...(asOf ? { _as_of: asOf } : {}),
    }),
  });
}

export function useAddressCommonMatches(addressId?: string, asOf?: string) {
  return useQuery<AddressOccupant[]>({
    queryKey: ['address-common-matches', addressId, asOf ?? 'current'],
    enabled: !!addressId,
    retry: 0,
    queryFn: () => rpc<AddressOccupant[]>('address_common_matches', {
      _address_id: addressId,
      ...(asOf ? { _as_of: asOf } : {}),
    }),
  });
}

export function useRelationshipIntelligenceSearch(query: string, kinds: string[]) {
  const term = query.trim();
  return useQuery<IntelligenceHit[]>({
    queryKey: ['relationship-intelligence-search', term, kinds.join(',')],
    enabled: term.length >= 3 && kinds.length > 0,
    retry: 0,
    queryFn: () => rpc<IntelligenceHit[]>('relationship_intelligence_search', {
      _query: term, _kinds: kinds, _limit: 50,
    }),
  });
}

export function useAddressProjectionQueue() {
  return useQuery<ProjectionQueueRow[]>({
    queryKey: ['address-projection-queue'],
    retry: 0,
    queryFn: () => rpc<ProjectionQueueRow[]>('address_projection_queue'),
  });
}

export function usePersonAddressIntelligence(partyId?: string, asOf?: string) {
  return useQuery<PersonAddressIntelligence>({
    queryKey: ['person-address-intelligence', partyId, asOf ?? 'current'],
    enabled: !!partyId,
    retry: 0,
    queryFn: () => rpc<PersonAddressIntelligence>('person_address_intelligence', {
      _party_id: partyId,
      ...(asOf ? { _as_of: asOf } : {}),
    }),
  });
}

/**
 * Address usages for one subject (entity / establishment / person), including
 * historical rows. Read through the RLS-governed `address_usages` relation —
 * `address_usage_visible()` filters every row by regulatory scope.
 */
export function useSubjectAddressUsages(
  subjectKind: 'ENTITY' | 'PERSON' | 'ESTABLISHMENT',
  subjectId?: string,
) {
  return useQuery<SubjectAddressUsage[]>({
    queryKey: ['subject-address-usages', subjectKind, subjectId],
    enabled: !!subjectId,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await db()
        .from('address_usages')
        .select(
          'id, address_id, usage_type, approval_status, effective_from, effective_to,'
          + ' source_kind, source_detail, approved_at, verified_at,'
          + ' addresses ( id, country_code, admin_area, locality, postal_code,'
          + ' street_line1, street_line2, unit, normalized_key, normalization_version )',
        )
        .eq('subject_kind', subjectKind)
        .eq('subject_id', subjectId)
        .order('effective_from', { ascending: false });
      if (error) throw classifyB4Error(error.message ?? error);
      return (data ?? []) as SubjectAddressUsage[];
    },
  });
}

/* ----------------------------------------------------------- mutations */

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['address-360'] });
    qc.invalidateQueries({ queryKey: ['address-common-matches'] });
    qc.invalidateQueries({ queryKey: ['subject-address-usages'] });
    qc.invalidateQueries({ queryKey: ['person-address-intelligence'] });
    qc.invalidateQueries({ queryKey: ['address-projection-queue'] });
  };
}

export function useApproveAddressUsage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { usageId: string; verify?: boolean }) =>
      rpc<string>('address_usage_approve', {
        _usage_id: input.usageId, _verify: !!input.verify,
      }),
    onSuccess: invalidate,
  });
}

export function useEndAddressUsage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { usageId: string; effectiveTo: string }) =>
      rpc<string>('address_usage_end', {
        _usage_id: input.usageId, _effective_to: input.effectiveTo,
      }),
    onSuccess: invalidate,
  });
}

export function useProjectAddressSources() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => rpc<{ addresses_touched: number; usages_touched: number; unresolved: number }>(
      'address_project_sources',
    ),
    onSuccess: invalidate,
  });
}
