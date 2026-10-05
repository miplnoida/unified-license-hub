import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripSecrets, DEFAULTS } from '@/hooks/useEmailSmsSettings';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

describe('SEC-CRED-01 provider secrets', () => {
  it('settings objects never carry provider secrets', () => {
    const s = stripSecrets({
      ...DEFAULTS,
      smtp: { ...DEFAULTS.smtp, password: 'x' },
      sms: { ...DEFAULTS.sms, apiKey: 'y' },
    });
    expect('password' in s.smtp).toBe(false);
    expect('apiKey' in s.sms).toBe(false);
  });

  it('database refuses provider secrets inside site_settings', () => {
    expect(migrations).toMatch(/CREATE TRIGGER site_settings_no_provider_secrets/);
    expect(migrations).toMatch(/PROVIDER_SECRET_FORBIDDEN_IN_SETTINGS/);
    expect(migrations).toMatch(/'resend_api_key','smtp_password','sms_api_key'/);
  });

  it('runtime reads the SMTP password only from server-side secret storage', () => {
    const provider = read('supabase/functions/_shared/email-provider.ts');
    expect(provider).toMatch(/readProviderSecret\(supabase, "smtp_password", "SMTP_PASSWORD"\)/);
    expect(provider).not.toMatch(/rawSmtp\.password/);
    const test = read('supabase/functions/test-smtp-email/index.ts');
    expect(test).not.toMatch(/savedSmtp\.password/);
  });

  it('seed file contains no provider secret fields', () => {
    const csv = read('supabase/baseline/seed/site_settings.csv');
    expect(csv).not.toMatch(/""password""|""apiKey""/);
  });
});
