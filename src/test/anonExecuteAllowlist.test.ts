import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * GAP-F0-08 — anonymous EXECUTE hardening.
 *
 * The database side is certified by scripts/verify-anon-execute.sql. This
 * static gate protects the checked-in allowlist from silent growth: any new
 * unauthenticated RPC must be added deliberately, with a caller that really
 * lives on a public (pre-authentication) route.
 */
const registry = JSON.parse(readFileSync('scripts/anon-execute-allowlist.json', 'utf8')) as {
  allowlist: { function: string; classification: string; journey: string; callers: string[] }[];
};

const EXPECTED = [
  'check_applicant_name_exists',
  'check_primary_user_email_exists',
  'get_active_captcha',
  'get_declaration_invitation_public',
  'get_fp_declaration_form_public',
  'get_public_complaint_tracking_v2',
  'submit_declaration_form',
  'verify_declaration_identity',
];

describe('GAP-F0-08 anon execute allowlist', () => {
  it('contains exactly the certified public RPCs', () => {
    expect(registry.allowlist.map((e) => e.function).sort()).toEqual(EXPECTED);
  });

  it('documents a journey and at least one caller for every entry', () => {
    for (const entry of registry.allowlist) {
      expect(entry.classification, entry.function).toBe('PUBLIC_RPC_REQUIRED');
      expect(entry.journey.length, entry.function).toBeGreaterThan(10);
      expect(entry.callers.length, entry.function).toBeGreaterThan(0);
    }
  });

  it('every declared caller exists and really calls the RPC', () => {
    for (const entry of registry.allowlist) {
      for (const caller of entry.callers) {
        expect(existsSync(caller), `${entry.function} -> ${caller}`).toBe(true);
        const src = readFileSync(caller, 'utf8');
        expect(src.includes(`'${entry.function}'`) || src.includes(`"${entry.function}"`), `${caller} calls ${entry.function}`).toBe(true);
      }
    }
  });

  it('keeps the certification gate script in place', () => {
    const sql = readFileSync('scripts/verify-anon-execute.sql', 'utf8');
    expect(sql).toContain('sec_anon_executable_functions');
    expect(sql).toContain('GAP-F0-08 regression');
  });
});
