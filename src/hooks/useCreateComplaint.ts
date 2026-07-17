/**
 * Canonical complaint creation hook (Phase 1).
 *
 * Wraps the new `create_complaint(variant, payload)` RPC so every intake
 * surface — public portal, licensee portal, internal officer, staff intake —
 * goes through a single code path. Field-level validation errors from the
 * database arrive in `error.details` as a JSON array of
 * `{ code, field, message }` objects and are surfaced verbatim to the UI.
 *
 * The hook is intentionally thin: schema-level structural validation still
 * lives in `src/lib/complaintSchemas.ts` and runs client-side before we
 * ever hit the RPC. This hook is the single mutation entry point.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/platform/logger';

export type ComplaintVariant = 'public' | 'licensee' | 'internal' | 'staff';

export interface CreateComplaintInput {
  variant: ComplaintVariant;
  payload: Record<string, unknown>;
}

export interface CreateComplaintResult {
  id: string;
  complaint_number: string;
  workflow_instance_id: string | null;
  complaint: Record<string, unknown>;
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
  const { data, error } = await supabase.rpc('create_complaint', {
    _variant: input.variant,
    _payload: input.payload as any,
  } as any);

  if (error) {
    // Structured validation errors come through the DETAIL field of the
    // Postgres error, which supabase-js surfaces as `error.details`.
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
