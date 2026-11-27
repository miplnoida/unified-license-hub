import { describe, expect, it } from 'vitest';
import { isDeterministicPersonRefusal, personRefusalMessage } from '@/hooks/usePerson360';

describe('Person 360 refusal handling', () => {
  it('explains an organisation party opened as a person', () => {
    expect(personRefusalMessage(new Error('PERSON_PARTY_REQUIRED'))).toMatch(/organisation, not a person/);
    expect(isDeterministicPersonRefusal(new Error('PERSON_PARTY_REQUIRED'))).toBe(true);
  });
  it('keeps unknown errors visible and retryable', () => {
    expect(personRefusalMessage(new Error('network down'))).toBe('network down');
    expect(isDeterministicPersonRefusal(new Error('network down'))).toBe(false);
  });
});
