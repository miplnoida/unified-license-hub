import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migDir = path.resolve(__dirname, '../../supabase/migrations');
const allSql = fs.readdirSync(migDir).map((f) => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');
const edge = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/register-pre-licensee/index.ts'), 'utf8');

describe('SEC-CRIT-01D registration credential boundary', () => {
  it('database refuses credential keys in registration business data', () => {
    expect(allSql).toMatch(/CREATE TRIGGER registrations_no_credentials\s+BEFORE INSERT OR UPDATE OF entity_specific_data ON public\.registrations/);
    expect(allSql).toMatch(/\?\| ARRAY\['password','confirm_password','confirmPassword'\][\s\S]*CREDENTIAL_FIELD_FORBIDDEN/);
  });

  it('historical cleanup removes keys entirely and logs only field names', () => {
    expect(allSql).toContain("entity_specific_data - 'password' - 'confirm_password' - 'confirmPassword'");
    const log = allSql.slice(allSql.indexOf('CREATE TABLE public.sec_credential_sanitisation_log'));
    const table = log.slice(0, log.indexOf(');'));
    expect(table).not.toMatch(/old_data|before|value/i);
  });

  it('registration function strips credentials before persisting business data', () => {
    expect(edge).toMatch(/confirm_\?password/);
    expect(edge).toMatch(/delete safeEntityData\[k\]/);
    expect(edge).toMatch(/entity_specific_data:\s*safeEntityData/);
  });
});
