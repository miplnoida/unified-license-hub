import { describe, it, expect } from 'vitest';
import { classifyLicenseeSearchError } from '@/lib/licenseeSearchErrors';

describe('classifyLicenseeSearchError', () => {
  it('classifies auth_required hint as auth_expired', () => {
    const r = classifyLicenseeSearchError({ code: '42501', hint: 'auth_required' });
    expect(r.category).toBe('auth_expired');
    expect(r.retryable).toBe(false);
  });

  it('classifies no_regulator_scope hint', () => {
    const r = classifyLicenseeSearchError({ code: '42501', hint: 'no_regulator_scope' });
    expect(r.category).toBe('no_regulator_scope');
    expect(r.retryable).toBe(false);
  });

  it('classifies bare 42501 as permission_denied', () => {
    const r = classifyLicenseeSearchError({ code: '42501', message: 'permission denied' });
    expect(r.category).toBe('permission_denied');
  });

  it('classifies TypeError as network', () => {
    const err = new TypeError('Failed to fetch');
    const r = classifyLicenseeSearchError(err);
    expect(r.category).toBe('network');
    expect(r.retryable).toBe(true);
  });

  it('classifies parse errors as shape_error', () => {
    const r = classifyLicenseeSearchError({ message: 'unexpected response shape' });
    expect(r.category).toBe('shape_error');
  });

  it('falls back to rpc_error', () => {
    const r = classifyLicenseeSearchError({ code: 'XX000', message: 'boom' });
    expect(r.category).toBe('rpc_error');
    expect(r.retryable).toBe(true);
  });

  it('never surfaces the raw message to the user', () => {
    const r = classifyLicenseeSearchError({
      code: 'XX000',
      message: 'CONFIDENTIAL internal detail',
    });
    expect(r.userMessage).not.toContain('CONFIDENTIAL');
  });
});
