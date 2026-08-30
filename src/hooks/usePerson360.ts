/**
 * F8A-B3 — data hooks for canonical Person 360 and person identity resolution.
 *
 * Every read and write goes through the governed SECURITY DEFINER RPCs
 * (`person_360_overview`, `person_relationship_network`, `fp_person_identity_queue`,
 * `fp_link_person_manual`, `entity_appointment_resolve_fp_bridge`). The client never
 * touches `fp_individual_party_links`, `entity_appointments` or `ownership_interests`
 * directly, and no matching, scoring or eligibility logic exists on this side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface PersonAppointment {
  appointment_id: string;
  entity_id: string;
  entity_name: string | null;
  role: string | null;
  is_executive: boolean | null;
  status: string | null;
  regulatory_approval_status: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean;
  fp_individual_id: string | null;
  source_authority: string;
  provenance: Record<string, unknown> | null;
}

export interface PersonOwnership {
  interest_id: string;
  owned_entity_id: string | null;
  owned_entity_name: string | null;
  owned_party_id: string | null;
  owned_party_name: string | null;
  economic_interest_percentage: number | null;
  voting_rights_percentage: number | null;
  is_controller: boolean | null;
  control_determination: string | null;
  is_direct: boolean | null;
  approval_status: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean;
  source_authority: string;
  provenance: Record<string, unknown> | null;
}

export interface PersonFpRole {
  role_id: string;
  role_type: string | null;
  role_title: string | null;
  licensee_id: string | null;
  license_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean | null;
  source_authority: string;
}

export interface PersonFpContext {
  fp_individual_id: string;
  full_name: string;
  status: string | null;
  link_method: string | null;
  link_category: string | null;
  linked_at: string | null;
  source_authority: string;
  roles: PersonFpRole[];
}

export interface PersonRelationship {
  relationship_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  counterparty_party_id: string | null;
  counterparty_name: string | null;
  relationship_type: string | null;
  entity_id: string | null;
  status: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean;
  source_authority: string;
}

export interface PersonNetwork {
  as_of: string;
  identity: {
    person_party_id: string;
    display_name: string;
    is_canonical_person: boolean;
    source_authority: string;
  };
  appointments: PersonAppointment[];
  ownership: PersonOwnership[];
  fp_contexts: PersonFpContext[];
  fp_contexts_visible: boolean;
  relationships: PersonRelationship[];
  counts: {
    appointments_total: number;
    appointments_current: number;
    ownership_total: number;
    ownership_current: number;
    fp_contexts: number;
    relationships: number;
    entities_with_appointments: number;
  };
  restricted_branches: number;
  restricted_reason: string | null;
  conflicts?: number;
}

export type IdentityQueueState =
  | 'LINKED_DETERMINISTIC'
  | 'MANUALLY_LINKED'
  | 'CONFLICT_DETECTED'
  | 'DETERMINISTIC_MATCH_AVAILABLE'
  | 'AMBIGUOUS_CANDIDATES'
  | 'NO_CANDIDATE';

export interface IdentityQueueRow {
  fp_individual_id: string;
  full_name: string;
  status: string | null;
  regulator_id: string | null;
  candidate_count: number;
  person_party_id: string | null;
  match_method: string | null;
  match_category: string | null;
  linked_at: string | null;
  state: IdentityQueueState;
  reason: string | null;
}

export function usePerson360(partyId?: string) {
  return useQuery({
    queryKey: ['person360', partyId],
    enabled: !!partyId,
    queryFn: () => rpc<PersonNetwork>('person_360_overview', { _person_party_id: partyId }),
  });
}

export function usePersonNetworkAsOf(partyId?: string, asOf?: string) {
  return useQuery({
    queryKey: ['person-network', partyId, asOf],
    enabled: !!partyId && !!asOf,
    queryFn: () => rpc<PersonNetwork>('person_relationship_network', {
      _person_party_id: partyId,
      _as_of: asOf,
    }),
  });
}

export function usePersonIdentityQueue(limit = 200) {
  return useQuery({
    queryKey: ['person-identity-queue', limit],
    queryFn: async () => {
      const data = await rpc<{ generated_at: string; rows: IdentityQueueRow[] }>(
        'fp_person_identity_queue', { _limit: limit },
      );
      return data;
    },
  });
}

export function useLinkPersonManually() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fpIndividualId: string; personPartyId: string; reason: string }) =>
      rpc<{ state: string; person_party_id: string }>('fp_link_person_manual', {
        _fp_individual_id: input.fpIndividualId,
        _person_party_id: input.personPartyId,
        _reason: input.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['person-identity-queue'] });
      qc.invalidateQueries({ queryKey: ['person360'] });
    },
  });
}

export function useResolveAppointmentFpBridge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      rpc<{ state: string; reason?: string; fp_individual_id?: string }>(
        'entity_appointment_resolve_fp_bridge', { _appointment_id: appointmentId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['person360'] });
      qc.invalidateQueries({ queryKey: ['person-identity-queue'] });
    },
  });
}
