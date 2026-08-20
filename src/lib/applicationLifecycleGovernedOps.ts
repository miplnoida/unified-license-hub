/**
 * Governed operations for the remaining application-lifecycle mutations.
 *
 * The browser no longer writes RFI records, workflow step configuration,
 * payment verification or refund decisions directly: the server derives the
 * acting officer, validates permission and state, and writes the audit trail.
 */
import { supabase } from '@/integrations/supabase/client';

function unwrap<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export interface RfiRaiseItem {
  prompt: string;
  question_type?: string;
  required?: boolean;
  item_due_at?: string | null;
}

export interface RfiRaisePayload {
  application_id: string;
  summary?: string | null;
  due_at?: string | null;
  approval_step_action_id?: string | null;
  sufficiency_evaluation_id?: string | null;
  pause_sla?: boolean;
  items: RfiRaiseItem[];
}

/** Creates an information request with its items and pauses the linked review clock. */
export async function applicationRfiRaise(payload: RfiRaisePayload) {
  const { data, error } = await supabase.rpc('application_rfi_raise' as any, {
    _payload: payload as any,
  } as any);
  return unwrap<Record<string, unknown>>(data, error);
}

export interface ApprovalStepConfigPayload {
  workflow_id?: string | null;
  step_actions?: Record<string, unknown>[];
  entry_notifications?: Record<string, unknown>[];
  action_notifications?: Record<string, unknown>[];
}

/** Writes approval step configuration rows (workflow authoring). */
export async function approvalStepConfigWrite(payload: ApprovalStepConfigPayload) {
  const { data, error } = await supabase.rpc('approval_step_config_write' as any, {
    _payload: payload as any,
  } as any);
  return unwrap<{ step_actions: number; entry_notifications: number; action_notifications: number }>(
    data,
    error,
  );
}

/** Marks a payment verified/received. Verifier and timestamp are server-derived. */
export async function applicationPaymentVerify(args: {
  payment_id?: string | null;
  application_id?: string | null;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc('application_payment_verify' as any, {
    _payment_id: args.payment_id ?? null,
    _application_id: args.application_id ?? null,
    _note: args.note ?? null,
  } as any);
  return unwrap<Record<string, unknown>>(data, error);
}

/** Approves or rejects a refund request; requires a written rationale. */
export async function paymentRefundDecide(args: {
  refund_id: string;
  decision: 'approved' | 'rejected';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('payment_refund_decide' as any, {
    _refund_id: args.refund_id,
    _decision: args.decision,
    _reason: args.reason,
  } as any);
  return unwrap<Record<string, unknown>>(data, error);
}
