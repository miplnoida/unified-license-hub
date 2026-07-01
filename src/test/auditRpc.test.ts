import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { supabase } from '@/integrations/supabase/client';
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

// Silence network IP lookup
(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ip: '' }) });

// Provide navigator/window
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'vitest' }, configurable: true });

import {
  logComplianceAudit,
  logSecurityEvent,
  logExport,
  logLogin,
} from '@/lib/complianceAudit';

beforeEach(() => rpc.mockClear());

describe('audit RPC helpers', () => {
  it('logComplianceAudit calls log_compliance_audit with metadata (route + user_agent)', async () => {
    await logComplianceAudit({ action_type: 'CREATE', object_type: 'application', object_id: 'app-1' });
    expect(rpc).toHaveBeenCalledWith('log_compliance_audit', expect.objectContaining({
      _action_type: 'CREATE',
      _object_type: 'application',
      _object_id: 'app-1',
      _metadata: expect.objectContaining({ user_agent: 'vitest', logged_at: expect.any(String) }),
    }));
  });

  it('logComplianceAudit refuses OVERRIDE without justification (client-side guard)', async () => {
    await expect(
      logComplianceAudit({ action_type: 'OVERRIDE', object_type: 'license' })
    ).rejects.toThrow(/justification/i);
    await expect(
      logComplianceAudit({ action_type: 'OVERRIDE', object_type: 'license', justification: 'short' })
    ).rejects.toThrow(/justification/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('logComplianceAudit allows OVERRIDE when justification ≥10 chars', async () => {
    await logComplianceAudit({
      action_type: 'OVERRIDE',
      object_type: 'license',
      object_id: 'lic-1',
      justification: 'Signed off by compliance director.',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('logExport routes to log_compliance_audit with EXPORT action and record_ids', async () => {
    await logExport({ object_type: 'application', format: 'CSV', record_ids: ['a', 'b', 'c'] });
    expect(rpc).toHaveBeenCalledWith('log_compliance_audit', expect.objectContaining({
      _action_type: 'EXPORT',
      _object_type: 'application',
      _after_value: expect.objectContaining({ format: 'CSV', record_count: 3, record_ids: ['a', 'b', 'c'] }),
    }));
  });

  it('logSecurityEvent calls log_security_event with metadata', async () => {
    await logSecurityEvent('ACCESS_DENIED', { target_resource: '/admin' });
    expect(rpc).toHaveBeenCalledWith('log_security_event', expect.objectContaining({
      _event_type: 'ACCESS_DENIED',
      _target_resource: '/admin',
      _user_agent: 'vitest',
      _metadata: expect.objectContaining({ user_agent: 'vitest' }),
    }));
  });

  it('logLogin records LOGIN action', async () => {
    await logLogin('user@example.com');
    expect(rpc).toHaveBeenCalledWith('log_compliance_audit', expect.objectContaining({
      _action_type: 'LOGIN',
      _object_type: 'auth.session',
      _after_value: { email: 'user@example.com' },
    }));
  });
});
