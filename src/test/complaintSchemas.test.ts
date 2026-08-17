import { describe, expect, it } from 'vitest';
import {
  publicComplaintSchema,
  internalComplaintSchema,
  licenseeComplaintSchema,
  complaintAttachmentMetaSchema,
} from '@/lib/complaintSchemas';

/**
 * Behavioural tests for the shared complaint intake schemas.
 * These schemas are the single source of truth used by the internal intake
 * form, the public submission Edge Function, and the licensee-side form.
 */
describe('complaint schemas', () => {
  const baseInternal = {
    subject: 'Card fraud reported',
    description: 'Customer alleged unauthorised transactions on debit card.',
    intake_source: 'internal' as const,
    vulnerability_indicator: false,
  };

  it('accepts a minimal internal complaint', () => {
    const parsed = internalComplaintSchema.safeParse(baseInternal);
    expect(parsed.success).toBe(true);
  });

  it('ignores any severity supplied to the internal schema', () => {
    const parsed = internalComplaintSchema.safeParse({ ...baseInternal, severity: 'critical' } as any);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as any).severity).toBeUndefined();
  });

  it('rejects subject shorter than 3 chars with a field-specific message', () => {
    const parsed = internalComplaintSchema.safeParse({ ...baseInternal, subject: 'Hi' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === 'subject');
      expect(issue?.message).toMatch(/at least 3/);
    }
  });

  it('rejects stale vulnerability_notes when indicator is false', () => {
    const parsed = internalComplaintSchema.safeParse({
      ...baseInternal,
      vulnerability_indicator: false,
      vulnerability_notes: 'lingering note from earlier draft',
    });
    expect(parsed.success).toBe(false);
  });

  it('requires notes or category when vulnerability indicator is true', () => {
    const parsed = internalComplaintSchema.safeParse({
      ...baseInternal,
      vulnerability_indicator: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('public schema disallows severity/priority in shape', () => {
    // Structural check: severity is not part of the public schema. Extra keys
    // are stripped by Zod on parse, so we assert the parsed output.
    const parsed = publicComplaintSchema.safeParse({
      subject: 'ATM overcharge',
      description: 'Machine deducted twice on withdrawal.',
      anonymous: false,
      email: 'user@example.com',
      severity: 'critical', // must be ignored / not surfaced
    } as any);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as any).severity).toBeUndefined();
    }
  });

  it('public schema requires email or phone unless anonymous', () => {
    const parsed = publicComplaintSchema.safeParse({
      subject: 'ATM overcharge',
      description: 'Machine deducted twice on withdrawal.',
      anonymous: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('public schema allows fully anonymous submissions', () => {
    const parsed = publicComplaintSchema.safeParse({
      subject: 'Retail bank mis-selling',
      description: 'Customer was pressured into unsuitable product.',
      anonymous: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('licensee schema requires a valid email', () => {
    const bad = licenseeComplaintSchema.safeParse({
      subject: 'Internal fraud tip',
      description: 'Suspicious wire from correspondent bank.',
      email: 'not-an-email',
    });
    expect(bad.success).toBe(false);
  });

  it('rejects attachments over 20MB', () => {
    const parsed = complaintAttachmentMetaSchema.safeParse({
      name: 'huge.pdf',
      size: 25 * 1024 * 1024,
      mime: 'application/pdf',
    });
    expect(parsed.success).toBe(false);
  });
});
