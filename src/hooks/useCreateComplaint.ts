/**
 * Canonical complaint creation hook.
 *
 * Wraps two RPCs so every intake surface goes through one code path:
 *  - `create_complaint(variant, payload)` — no attachments
 *  - `create_complaint_with_attachments(variant, payload, staged_ids, idempotency_key)`
 *    — atomic creation + staged upload linkage. On any failure the entire
 *    transaction rolls back, so a complaint never exists without its
 *    intended evidence.
 *
 * Field-level validation errors from the database arrive in `error.details`
 * as a JSON array of `{ code, field, message }` objects and are surfaced
 * verbatim to the UI. Structural (Zod) validation still runs client-side
 * before we hit the RPC.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/platform/logger';

export type ComplaintVariant =
  | 'public'
  | 'anonymous'
  | 'licensee'
  | 'internal'
  | 'referral'
  | 'whistleblower'
  | 'staff';

/** Variants understood by the DB RPC. Others are mapped down. */
function normaliseVariant(v: ComplaintVariant): 'public' | 'licensee' | 'internal' | 'staff' {
  if (v === 'anonymous') return 'public';
  if (v === 'referral' || v === 'whistleblower') return 'internal';
  return v;
}

export interface CreateComplaintInput {
  variant: ComplaintVariant;
  payload: Record<string, unknown>;
  /** Optional staged upload IDs to link atomically. */
  stagedUploadIds?: string[];
  /** Idempotency key so retries don't create a second complaint. */
  idempotencyKey?: string;
}

export interface CreateComplaintResult {
  id: string;
  complaint_number: string;
  workflow_instance_id: string | null;
  complaint: Record<string, unknown>;
  idempotent?: boolean;
}

export interface ComplaintFieldError {
  code: string;
  field: string;
  message: string;
}

export class ComplaintValidationError extends Error {
  fieldErrors: ComplaintFieldError[];
  constructor(fieldErrors: ComplaintFieldError[]) {
    super('Complaint validation failed');
    this.name = 'ComplaintValidationError';
    this.fieldErrors = fieldErrors;
  }
}

function parseFieldErrors(details: unknown): ComplaintFieldError[] | null {
  if (typeof details !== 'string') return null;
  try {
    const parsed = JSON.parse(details);
    if (Array.isArray(parsed) && parsed.every((e) => e && typeof e.field === 'string')) {
      return parsed as ComplaintFieldError[];
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function createComplaint(
  input: CreateComplaintInput,
): Promise<CreateComplaintResult> {
  const variant = normaliseVariant(input.variant);
  const hasAttachments = !!(input.stagedUploadIds && input.stagedUploadIds.length);
  const hasIdempotency = !!input.idempotencyKey;

  // Use the atomic combined RPC whenever we have attachments OR an
  // idempotency key. Otherwise fall through to the legacy RPC to keep
  // existing tests / callers unaffected.
  if (hasAttachments || hasIdempotency) {
    const { data, error } = await supabase.rpc('create_complaint_with_attachments' as any, {
      _variant: variant,
      _payload: input.payload as any,
      _staged_upload_ids: input.stagedUploadIds ?? [],
      _idempotency_key: input.idempotencyKey ?? null,
    } as any);
    if (error) {
      const parsed = parseFieldErrors((error as any).details);
      if (parsed) throw new ComplaintValidationError(parsed);
      logger.error(error as Error, { feature: 'complaints', op: 'create_complaint_with_attachments' });
      throw error;
    }
    return data as unknown as CreateComplaintResult;
  }

  const { data, error } = await supabase.rpc('create_complaint', {
    _variant: variant,
    _payload: input.payload as any,
  } as any);

  if (error) {
    const parsed = parseFieldErrors((error as any).details);
    if (parsed) throw new ComplaintValidationError(parsed);
    logger.error(error as Error, { feature: 'complaints', op: 'create_complaint' });
    throw error;
  }

  return data as unknown as CreateComplaintResult;
}

export function useCreateComplaint() {
  const qc = useQueryClient();
  return useMutation<CreateComplaintResult, unknown, CreateComplaintInput>({
    mutationFn: createComplaint,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}
