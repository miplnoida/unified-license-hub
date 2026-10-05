import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { isSecretWriteProven, saveProviderSecret, SecretNotSavedError } from '@/hooks/useEmailSmsSettings';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const T0 = '2026-10-05T20:03:54Z';
const T1 = '2026-10-05T21:30:00Z';

describe('SEC-CRED-01A save acknowledgement', () => {
  beforeEach(() => rpc.mockReset());

  it('proves a write only when the server timestamp moves forward', () => {
    expect(isSecretWriteProven({ updated_at: T0 }, { configured: true, updated_at: T1 })).toBe(true);
    expect(isSecretWriteProven({ updated_at: T0 }, { configured: true, updated_at: T0 })).toBe(false);
    expect(isSecretWriteProven({ updated_at: T0 }, { configured: false, updated_at: T1 })).toBe(false);
    expect(isSecretWriteProven({ updated_at: T0 }, null)).toBe(false);
    expect(isSecretWriteProven(null, { configured: true, updated_at: T1, updated_by: 'u2' }, 'u1')).toBe(false);
  });

  it('succeeds when setter and read-back both confirm a newer write', async () => {
    rpc
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T0 }, error: null })
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T1, updated_by: 'u1' }, error: null })
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T1, updated_by: 'u1' }, error: null });
    await expect(saveProviderSecret('smtp_password', 'x', 'u1')).resolves.toMatchObject({ updated_at: T1 });
  });

  it('fails when the setter errors', async () => {
    rpc
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T0 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(saveProviderSecret('smtp_password', 'x', 'u1')).rejects.toBeInstanceOf(SecretNotSavedError);
  });

  it('fails when the timestamp does not change', async () => {
    rpc
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T0 }, error: null })
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T0 }, error: null })
      .mockResolvedValueOnce({ data: { configured: true, updated_at: T0 }, error: null });
    await expect(saveProviderSecret('smtp_password', 'x', 'u1')).rejects.toThrow('SMTP password was not saved. Existing credential remains unchanged.');
  });
});

describe('SEC-CRED-01A source guarantees', () => {
  const sql = fs.readdirSync(path.join(root, 'supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
  const page = read('src/pages/settings/EmailSmsSettings.tsx');
  const fn = read('supabase/functions/test-smtp-email/index.ts');

  it('status RPC returns metadata only', () => {
    const body = sql.slice(sql.lastIndexOf('FUNCTION public.email_provider_secret_status'));
    const fnBody = body.slice(0, body.indexOf('END $$'));
    expect(fnBody).toMatch(/'configured'/);
    expect(fnBody).not.toMatch(/s\.value|length\(|left\(|right\(|md5|sha/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.email_provider_secret_status\(text\) FROM PUBLIC, anon/);
  });

  it('browser test request carries no password or SMTP config', () => {
    expect(page).toMatch(/invoke\('test-smtp-email', \{\s*body: \{ to: testTo \},/);
    expect(page).not.toMatch(/smtpPayload/);
  });

  it('test button is blocked while a new password is unsaved', () => {
    expect(page).toMatch(/disabled=\{sendingTest \|\| unsavedSmtpPassword\}/);
    expect(page).toContain('Save the new SMTP password successfully before testing.');
  });

  it('test function uses only the stored secret and audits without secrets', () => {
    expect(fn).toMatch(/password: \(await readProviderSecret\(admin, "smtp_password", "SMTP_PASSWORD"\)\) \|\| ""/);
    expect(fn).not.toMatch(/incoming\?\.password/);
    expect(fn).toMatch(/email_provider_test_log/);
    const auditBlock = fn.slice(fn.indexOf('const audit'), fn.indexOf('const audit') + 600);
    expect(auditBlock).not.toMatch(/password|pass:/);
  });
});
