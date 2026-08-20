import { supabase } from '@/integrations/supabase/client';

/**
 * Governed operations for compliance return filing (A1 authority closure).
 *
 * Browser roles hold no INSERT/UPDATE/DELETE on `public.compliance_returns`.
 * Every create / save / submit / review flows through these SECURITY DEFINER
 * RPCs, which derive the filer/reviewer and timestamps server-side, verify
 * entitlement, validate state, and write the compliance audit record.
 */
export interface ComplianceReturnDraftPayload {
  return_id?: string | null;
  return_config_id?: string | null;
  license_id?: string | null;
  on_behalf_of_licensee_id?: string | null;
  period_start?: string;
  period_end?: string;
  due_date?: string;
  form_data?: unknown;
}

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Create or update a draft return. Server forces status = draft. */
export async function complianceReturnSaveDraft(
  payload: ComplianceReturnDraftPayload,
): Promise<Record<string, unknown>> {
  const { data, error } = await (supabase as any).rpc('compliance_return_save_draft', {
    _payload: payload as never,
  });
  return unwrap(data, error) as Record<string, unknown>;
}

/** Submit a return. Server sets status = submitted and submitted_at. */
export async function complianceReturnSubmit(
  payload: ComplianceReturnDraftPayload,
): Promise<Record<string, unknown>> {
  const { data, error } = await (supabase as any).rpc('compliance_return_submit', {
    _payload: payload as never,
  });
  return unwrap(data, error) as Record<string, unknown>;
}

/** Regulator review outcome. Requires returns_management review permission. */
export async function complianceReturnReviewDecision(
  returnId: string,
  decision: 'accepted' | 'revision_requested' | 'rejected' | 'under_review',
  comments: string | null,
): Promise<Record<string, unknown>> {
  const { data, error } = await (supabase as any).rpc('compliance_return_review_decision', {
    _return_id: returnId,
    _decision: decision,
    _comments: comments,
  });
  return unwrap(data, error) as Record<string, unknown>;
}

/** Records the filer's declaration text on a return (server-derived actor/timestamp). */
export async function complianceReturnAcknowledge(returnId: string, ackText: string) {
  const { data, error } = await supabase.rpc('compliance_return_acknowledge' as any, {
    _return_id: returnId,
    _ack_text: ackText,
  } as any);
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}
