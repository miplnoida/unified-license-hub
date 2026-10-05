import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));

import {
  getRegistrationCapability,
  setRegistrationJourneyEmail,
  registrationUploadCapabilityForSubmit,
} from '@/lib/registrationFileAccess';

describe('SEC-CRIT-01B registration-bound upload capability', () => {
  beforeEach(() => { localStorage.clear(); invoke.mockReset(); setRegistrationJourneyEmail(null); });

  it('refuses to issue a capability before the email journey is verified', async () => {
    await expect(getRegistrationCapability()).rejects.toThrow(/verify your email/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('issues for the verified journey email and presents it at submission', async () => {
    invoke.mockResolvedValue({ data: { capability_id: '11111111-1111-1111-1111-111111111111', secret: 'a'.repeat(64), expires_at: '2999-01-01', journey_email: 'x@y.z' } });
    setRegistrationJourneyEmail('X@Y.z');
    await getRegistrationCapability();
    expect(invoke).toHaveBeenCalledWith('registration-file-access', { body: { action: 'issue', email: 'x@y.z' } });
    expect(registrationUploadCapabilityForSubmit()?.capability_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('server function requires journey, durable file record and registration match', () => {
    const src = readFileSync('supabase/functions/registration-file-access/index.ts', 'utf8');
    expect(src).toContain("journey_not_verified");
    expect(src).toContain("from('registration_upload_files')");
    expect(src).toContain("registration_mismatch");
    const reg = readFileSync('supabase/functions/register-pre-licensee/index.ts', 'utf8');
    expect(reg).toContain("registration_upload_capability_bind");
    expect(reg).toContain("_registration_id: regData.id");
  });
});
