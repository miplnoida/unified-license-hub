import { describe, it, expect } from 'vitest';
import { canUsePostLicenceServices, pickKeyPersonService } from '@/lib/postLicenceAccess';

describe('post-licence access', () => {
  it('blocks pre-licensee accounts even when a licence exists', () => {
    expect(canUsePostLicenceServices({ role: 'pre_licensee' })).toBe(false);
  });
  it('blocks applicant accounts', () => {
    expect(canUsePostLicenceServices({ role: 'applicant' })).toBe(false);
  });
  it('allows licensee primary users', () => {
    expect(canUsePostLicenceServices({ role: 'licensee_primary' })).toBe(true);
  });
  it('allows PPOC users', () => {
    expect(canUsePostLicenceServices({ role: 'pre_licensee', isPpoc: true })).toBe(true);
  });
});

describe('key person service preselection', () => {
  const services = [
    { id: 'a', name: 'Change of Registered Address' },
    { id: 'b', name: 'Appointment or Change of Senior Management' },
    { id: 'c', name: 'Appointment of Director' },
    { id: 'd', name: 'Resignation or Removal of Director' },
  ];
  it('prefers director appointment', () => {
    expect(pickKeyPersonService(services, 'appoint')?.id).toBe('c');
  });
  it('finds resignation service', () => {
    expect(pickKeyPersonService(services, 'resign')?.id).toBe('d');
  });
});
