/**
 * Shared Zod schemas for complaint intake.
 *
 * These schemas are the single source of truth for validation used by:
 *   - Public complaint submission form
 *   - Internal complaint intake form (NewInternalComplaint)
 *   - Licensee-side complaint submission
 *   - Edge Function payload validation (submit-public-complaint)
 *
 * They enforce structural rules only. Business rules that depend on
 * configured intake requirements (e.g. "complaint type required for this
 * regulator") are enforced additionally by the backend RPC using
 * `complaint_intake_rules`.
 *
 * Design principles:
 *   - External complainants CANNOT set regulatory severity/priority. Those
 *     fields are absent from the public/licensee schemas by design; only the
 *     internal schema allows staff to record initial severity, and even then
 *     the backend triage rules may override.
 *   - Vulnerability fields are consistency-checked here AND enforced by a
 *     DB trigger to prevent stale notes when the indicator is false.
 *   - Anonymous complaints skip email/phone entirely (both undefined) rather
 *     than accepting empty strings that might mask missing consent.
 */

import { z } from 'zod';

const trimmedString = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const uuidOrNull = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const emailField = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .max(255, 'Email must be at most 255 characters');

const phoneField = z
  .string()
  .trim()
  .regex(/^[+()\d\s-]{6,20}$/, 'Enter a valid phone number')
  .max(20);

export const INTAKE_SOURCES = [
  'internal',
  'supervisory',
  'whistleblower',
  'referral',
  'industry',
  'other',
] as const;

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export const CUSTOMER_TYPES = [
  'retail',
  'sme',
  'corporate',
  'vulnerable',
  'other',
] as const;

/** Fields common to every complaint intake variant. */
const commonComplaintFields = {
  subject: trimmedString(3, 250, 'Subject'),
  description: trimmedString(10, 5000, 'Description'),
  licensee_id: uuidOrNull,
  complaint_type_id: uuidOrNull,
  conduct_risk_category_id: uuidOrNull,
  product_id: uuidOrNull,
  channel_id: uuidOrNull,
  customer_type: z.enum(CUSTOMER_TYPES).optional().nullable(),
  vulnerability_indicator: z.boolean().default(false),
  vulnerability_category: optionalTrimmed(120),
  vulnerability_notes: optionalTrimmed(2000),
  pending_upload_ids: z.array(z.string().uuid()).max(20).optional().default([]),
};

/**
 * Vulnerability consistency:
 *   - indicator=false => notes AND category must both be empty
 *   - indicator=true  => at least one of {notes, category} must be present
 */
const vulnerabilityRefinement = (data: {
  vulnerability_indicator: boolean;
  vulnerability_notes?: string;
  vulnerability_category?: string;
}) => {
  if (data.vulnerability_indicator) {
    return !!(data.vulnerability_notes || data.vulnerability_category);
  }
  return !data.vulnerability_notes && !data.vulnerability_category;
};

const vulnerabilityRefinementMessage = {
  message:
    'When vulnerability is marked, provide a category or explanatory notes; when unmarked, leave both blank.',
  path: ['vulnerability_indicator'],
};

/**
 * PUBLIC complaint schema.
 * Complainants supply their own contact details unless anonymous.
 * They cannot set severity or priority.
 */
export const publicComplaintSchema = z
  .object({
    ...commonComplaintFields,
    anonymous: z.boolean().default(false),
    complainant_name: optionalTrimmed(200),
    email: emailField.optional(),
    phone: phoneField.optional(),
    /** Complainant's own free-form description of impact — regulator triages actual severity. */
    complainant_impact_description: optionalTrimmed(1000),
  })
  .refine(vulnerabilityRefinement, vulnerabilityRefinementMessage)
  .refine(
    (d) => d.anonymous || !!d.email || !!d.phone,
    {
      message: 'Provide an email or phone number, or mark the complaint anonymous.',
      path: ['email'],
    },
  );

export type PublicComplaintInput = z.infer<typeof publicComplaintSchema>;

/**
 * INTERNAL complaint schema (regulator staff intake).
 * Severity is NEVER accepted from any caller — the backend assigns it from
 * complaint intake/triage configuration. Supervisors can only change it later
 * through the logged override path on the complaint detail page.
 */
export const internalComplaintSchema = z
  .object({
    ...commonComplaintFields,
    intake_source: z.enum(INTAKE_SOURCES).default('internal'),
    email: emailField.optional(),
    phone: phoneField.optional(),
    /** True when logging a whistleblower / anonymous walk-in. */
    anonymous: z.boolean().default(false),
  })
  .refine(vulnerabilityRefinement, vulnerabilityRefinementMessage);

export type InternalComplaintInput = z.infer<typeof internalComplaintSchema>;

/**
 * LICENSEE-side complaint submission (a regulated entity reporting to the
 * regulator). Same as public, but licensee identity comes from the session,
 * and licensee_id is enforced server-side rather than chosen by the caller.
 */
export const licenseeComplaintSchema = z
  .object({
    ...commonComplaintFields,
    email: emailField,
    phone: phoneField.optional(),
  })
  .omit({ licensee_id: true } as any)
  .refine(vulnerabilityRefinement, vulnerabilityRefinementMessage);

export type LicenseeComplaintInput = z.infer<typeof licenseeComplaintSchema>;

/** Attachment metadata validated before upload is initiated. */
export const complaintAttachmentMetaSchema = z.object({
  name: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024, 'Attachment exceeds 20MB limit'),
  mime: z.string().min(1).max(200),
});

export type ComplaintAttachmentMeta = z.infer<typeof complaintAttachmentMetaSchema>;
