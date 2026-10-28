import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { useRegistrationUploadVerification } from '@/hooks/useRegistrationUploadVerification';
import { getRegistrationCapability, setRegistrationJourneyEmail } from '@/lib/registrationFileAccess';
import { withUploadVerificationStage, UPLOAD_VERIFICATION_STAGE } from '@/lib/registrationEmailVerification';

describe('fresh registration upload ownership', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); invoke.mockReset(); setRegistrationJourneyEmail(null); });
  it('puts independent ownership verification before documents after collecting email', () => {
    const steps = [{ id: 'email', type: 'dynamic', stepData: { id: 'email', title: 'Primary user', rows: [{ columns: [{ field: { type: 'email', fieldName: 'email', label: 'Email' } }] }] } }, { id: 'documents', type: 'documents' }];
    const result = withUploadVerificationStage(steps as Parameters<typeof withUploadVerificationStage>[0]);
    expect(result.map(s => s.id)).toEqual(['email', UPLOAD_VERIFICATION_STAGE, 'documents']);
  });
  it('ignores old form/local markers for returning or submission-OTP-disabled applicants', async () => {
    sessionStorage.setItem('registrationEmailVerified:a@example.com', 'true');
    invoke.mockResolvedValue({ data: { verified: false } });
    const { result } = renderHook(() => useRegistrationUploadVerification('a@example.com'));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.verified).toBe(false);
    expect(invoke).toHaveBeenCalledWith('verify-registration-otp', { body: {
      email: 'a@example.com', channel: 'email', purpose: 'registration', checkOnly: true, freshForUploads: true,
    } });
    await expect(getRegistrationCapability()).rejects.toThrow(/verify your email/i);
  });
  it('accepts fresh server verification regardless of configured OTP placement', async () => {
    invoke.mockResolvedValue({ data: { verified: true } });
    const { result } = renderHook(() => useRegistrationUploadVerification('a@example.com'));
    await waitFor(() => expect(result.current.verified).toBe(true));
    invoke.mockResolvedValue({ data: { capability_id: 'cap', secret: 'test-only', journey_email: 'a@example.com', expires_at: '2999-01-01' } });
    await getRegistrationCapability();
    expect(invoke).toHaveBeenLastCalledWith('registration-file-access', { body: { action: 'issue', email: 'a@example.com' } });
  });
  it('invalidates verified state and a stored capability when the email changes', async () => {
    invoke.mockResolvedValue({ data: { verified: false } });
    const { result, rerender } = renderHook(({ email }) => useRegistrationUploadVerification(email), { initialProps: { email: 'a@example.com' } });
    await waitFor(() => expect(result.current.checking).toBe(false));
    act(() => result.current.confirm());
    expect(result.current.verified).toBe(true);
    localStorage.setItem('olras.registrationUploadCapability', JSON.stringify({ capability_id: 'cap', secret: 'test-only', journey_email: 'a@example.com', expires_at: '2999-01-01' }));
    rerender({ email: 'b@example.com' });
    expect(result.current.verified).toBe(false);
    await expect(getRegistrationCapability()).rejects.toThrow(/verify your email/i);
  });
});