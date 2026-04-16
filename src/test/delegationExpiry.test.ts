import { describe, it, expect } from 'vitest';

interface DelegationRule {
  id: string;
  is_active: boolean;
  effective_until: string | null;
  delegate_from_user_id: string | null;
}

function getExpiredDelegations(rules: DelegationRule[], now: string): DelegationRule[] {
  return rules.filter(r =>
    r.effective_until &&
    r.effective_until < now &&
    r.is_active &&
    r.delegate_from_user_id
  );
}

describe('Delegation Auto-Expiry', () => {
  const now = '2026-04-16T12:00:00Z';

  it('identifies expired delegation rules', () => {
    const rules: DelegationRule[] = [
      { id: '1', is_active: true, effective_until: '2026-04-15T00:00:00Z', delegate_from_user_id: 'user-a' },
      { id: '2', is_active: true, effective_until: '2026-04-20T00:00:00Z', delegate_from_user_id: 'user-b' },
    ];
    const expired = getExpiredDelegations(rules, now);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe('1');
  });

  it('ignores already inactive rules', () => {
    const rules: DelegationRule[] = [
      { id: '1', is_active: false, effective_until: '2026-04-15T00:00:00Z', delegate_from_user_id: 'user-a' },
    ];
    expect(getExpiredDelegations(rules, now)).toHaveLength(0);
  });

  it('ignores routing rules (no delegate_from_user_id)', () => {
    const rules: DelegationRule[] = [
      { id: '1', is_active: true, effective_until: '2026-04-15T00:00:00Z', delegate_from_user_id: null },
    ];
    expect(getExpiredDelegations(rules, now)).toHaveLength(0);
  });

  it('ignores rules with no effective_until', () => {
    const rules: DelegationRule[] = [
      { id: '1', is_active: true, effective_until: null, delegate_from_user_id: 'user-a' },
    ];
    expect(getExpiredDelegations(rules, now)).toHaveLength(0);
  });
});
