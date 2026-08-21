/**
 * P04 A.6 / A.14–A.18 / A.21 — variation, decision-appeal, fee and
 * verification read models plus their governed operations.
 *
 * Every eligibility rule, blocker, maker/checker constraint and status
 * transition is decided by the server RPCs below. The browser renders what the
 * server returns and never writes these tables directly (browser DML = 0).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

/* ------------------------------- fees -------------------------------- */

export interface LicenseFeeAssessment {
  id: string;
  license_id: string;
  matter_id: string | null;
  matter_kind: string | null;
  fee_type_code: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: 'due' | 'paid' | 'verified' | 'waived' | 'void';
  blocking: boolean;
  payment_verification_required: boolean;
  due_date: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  waived_by: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  assessed_at: string;
}

export interface LicenseFeeLedger {
  assessments: LicenseFeeAssessment[];
  summary: { outstanding: number; outstanding_amount: number; verified: number; waived: number };
  gates: Array<{ key: string; label: string; href?: string }>;
}

export function useLicenseFeeLedger(licenseId?: string | null) {
  return useQuery({
    queryKey: ['license-fee-ledger', licenseId],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: () => rpc<LicenseFeeLedger>('license_fee_ledger', { _license_id: licenseId }),
  });
}

export type LicenseFeeOperation = 'record_payment' | 'verify_payment' | 'waive';

export function useLicenseFeeOperation(licenseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { assessmentId: string; operation: LicenseFeeOperation; payload?: Record<string, unknown> }) =>
      rpc<Record<string, unknown>>('license_fee_operation', {
        _assessment_id: vars.assessmentId,
        _operation: vars.operation,
        _payload: vars.payload ?? {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-fee-ledger', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-case', licenseId] });
    },
  });
}

/* --------------------------- verification ---------------------------- */

export interface LicenseVerificationItem {
  id: string;
  case_id: string;
  item_key: string;
  label: string;
  required: boolean;
  result: 'satisfied' | 'not_satisfied' | 'not_applicable' | null;
  note: string | null;
  recorded_at: string | null;
}

export interface LicenseVerificationCase {
  case: {
    id: string;
    license_id: string;
    matter_id: string | null;
    matter_kind: string | null;
    status: 'in_progress' | 'completed';
    outcome: string | null;
    started_at: string;
    completed_at: string | null;
  };
  items: LicenseVerificationItem[];
}

export function useLicenseVerificationCases(licenseId?: string | null) {
  return useQuery({
    queryKey: ['license-verification-cases', licenseId],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: () => rpc<LicenseVerificationCase[]>('license_verification_case_view', { _license_id: licenseId }),
  });
}

export function useLicenseVerificationOperation(licenseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { operation: 'start' | 'record_item' | 'complete'; payload: Record<string, unknown> }) =>
      rpc<Record<string, unknown>>('license_verification_operation', {
        _operation: vars.operation,
        _payload: vars.payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-verification-cases', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-fee-ledger', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-case', licenseId] });
    },
  });
}

/* ---------------------------- variations ----------------------------- */

export interface LicenseVariationItem {
  id: string;
  field_key: string;
  label: string;
  current_value: string | null;
  requested_value: string | null;
  approved_value: string | null;
  requires_assessment: boolean;
}

export interface LicenseVariationCase {
  variation: {
    id: string;
    license_id: string;
    matter_id: string | null;
    application_id: string | null;
    variation_reference: string | null;
    variation_type: string;
    status: string;
    rationale: string | null;
    requested_at: string;
    decision: string | null;
    decision_id: string | null;
    decided_at: string | null;
    effective_date: string | null;
  };
  items: LicenseVariationItem[];
}

export function useLicenseVariations(licenseId?: string | null) {
  return useQuery({
    queryKey: ['license-variations', licenseId],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: () => rpc<LicenseVariationCase[]>('license_variation_case', { _license_id: licenseId }),
  });
}

export function useLicenseVariationOperation(licenseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { operation: 'open' | 'decide'; payload: Record<string, unknown> }) =>
      rpc<Record<string, unknown>>('license_variation_operation', {
        _operation: vars.operation,
        _payload: vars.payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-variations', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-case', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-appealable-decisions', licenseId] });
    },
  });
}

/* ------------------------ decision appeals --------------------------- */

export interface LicenseDecisionAppealRecord {
  appeal: {
    id: string;
    appeal_reference: string | null;
    decision_id: string;
    status: 'lodged' | 'under_review' | 'determined' | 'withdrawn';
    grounds: string;
    relief_sought: string | null;
    lodged_at: string;
    appeal_deadline: string | null;
    stay_of_effect: boolean;
    outcome: string | null;
    outcome_rationale: string | null;
    decided_at: string | null;
  };
  decision: {
    id: string;
    reference: string | null;
    decision_type: string | null;
    decision: string | null;
    decided_at: string | null;
    effective_date: string | null;
    appeal_deadline: string | null;
    appealable: boolean | null;
    rationale: string | null;
  };
}

export interface AppealableDecision {
  id: string;
  reference: string | null;
  decision_type: string | null;
  decision: string | null;
  decided_at: string | null;
  appeal_deadline: string | null;
}

export function useLicenseDecisionAppeals(licenseId?: string | null) {
  return useQuery({
    queryKey: ['license-decision-appeals', licenseId],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: () => rpc<LicenseDecisionAppealRecord[]>('license_decision_appeal_view', { _license_id: licenseId }),
  });
}

export function useLicenseAppealableDecisions(licenseId?: string | null) {
  return useQuery({
    queryKey: ['license-appealable-decisions', licenseId],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: () => rpc<AppealableDecision[]>('license_appealable_decisions', { _license_id: licenseId }),
  });
}

export function useLicenseDecisionAppealOperation(licenseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      operation: 'lodge' | 'acknowledge' | 'determine' | 'withdraw';
      payload: Record<string, unknown>;
    }) =>
      rpc<Record<string, unknown>>('license_decision_appeal_operation', {
        _operation: vars.operation,
        _payload: vars.payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-decision-appeals', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-appealable-decisions', licenseId] });
    },
  });
}

/* ---------------------- A.21 entity 360 summary ---------------------- */

export interface EntityLicenceSummary {
  licences: Array<{
    license_id: string;
    license_number: string | null;
    license_type: string | null;
    status: string;
    issued_at: string | null;
    valid_from: string | null;
    valid_until: string | null;
    open_matters: number;
    open_conditions: number;
    outstanding_fees: number;
    live_appeals: number;
  }>;
  summary: { total: number; active: number; suspended: number; revoked: number; expiring_90d: number };
}

export function useEntityLicenceSummary(entityId?: string | null) {
  return useQuery({
    queryKey: ['entity-licence-summary', entityId],
    enabled: !!entityId,
    staleTime: 30_000,
    queryFn: () => rpc<EntityLicenceSummary>('entity_license_summary', { _entity_id: entityId }),
  });
}
