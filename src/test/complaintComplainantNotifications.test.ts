import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the complainant notification contract for the Consumer Complaint
 * lifecycle. Registered complainants resolve to their portal user; public
 * (email-only) complainants resolve to a direct-email recipient. Neither path
 * may silently resolve nobody.
 */
describe('complaint complainant notification contract', () => {
  const dispatcher = readFileSync(
    resolve(__dirname, '../../supabase/functions/dispatch-notification-event/index.ts'),
    'utf-8',
  );

  it('exposes a single canonical complainant recipient resolver', () => {
    expect(dispatcher).toMatch(/async function complainantRecipients\(/);
    expect(dispatcher).toMatch(/case "complainant":/);
  });

  it('resolves registered complainants, then the complaint email, then the party email', () => {
    expect(dispatcher).toMatch(/from\("complaints"\)\s*\n\s*\.select\("complainant_id, email"\)/);
    expect(dispatcher).toMatch(/from\("complaint_parties"\)/);
    expect(dispatcher).toMatch(/return \[`email:\$\{recordEmail\}`\]/);
  });

  it('supports payload-key custom_email rules used by the seeded complaint configs', () => {
    expect(dispatcher).toMatch(/typeof rule\.key === "string" && typeof ctx\.payload\?\.\[rule\.key\] === "string"/);
  });

  it('records an explicit no-recipient outcome instead of silently dropping an event', () => {
    expect(dispatcher).toMatch(/no_recipient_resolved/);
    expect(dispatcher).toMatch(/if \(recipients\.length === 0\) \{/);
  });
});
