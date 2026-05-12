import { describe, it, expect } from 'vitest';

interface V { version: number; effective_from: string | null; effective_until: string | null }

function pickEffective(rows: V[], nowIso: string): V | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.version - a.version);
  const eff = sorted.filter(v => {
    const fromOk = !v.effective_from || v.effective_from <= nowIso;
    let untilOk = true;
    if (v.effective_until) {
      const until = new Date(v.effective_until);
      until.setUTCHours(23, 59, 59, 999);
      untilOk = until.toISOString() >= nowIso;
    }
    return fromOk && untilOk;
  });
  return eff[0] || sorted[0] || null;
}

describe('Form version effective-window filter', () => {
  const now = '2026-04-27T12:00:00Z';

  it('returns the highest effective version', () => {
    const rows: V[] = [
      { version: 2, effective_from: '2026-05-01T00:00:00Z', effective_until: null }, // future
      { version: 1, effective_from: '2026-01-01T00:00:00Z', effective_until: null }, // active
    ];
    expect(pickEffective(rows, now)?.version).toBe(1);
  });

  it('falls back to latest when none effective', () => {
    const rows: V[] = [
      { version: 2, effective_from: '2027-01-01T00:00:00Z', effective_until: null },
    ];
    expect(pickEffective(rows, now)?.version).toBe(2);
  });

  it('skips expired versions', () => {
    const rows: V[] = [
      { version: 3, effective_from: null, effective_until: '2026-01-01T00:00:00Z' }, // expired
      { version: 2, effective_from: null, effective_until: null }, // active
    ];
    expect(pickEffective(rows, now)?.version).toBe(2);
  });

  it('treats effective_until as inclusive through end of day', () => {
    const rows: V[] = [
      { version: 2, effective_from: '2026-04-01T00:00:00Z', effective_until: '2026-04-27T00:00:00Z' },
      { version: 1, effective_from: '2026-01-01T00:00:00Z', effective_until: null },
    ];
    expect(pickEffective(rows, now)?.version).toBe(2);
  });

  it('returns null on empty', () => {
    expect(pickEffective([], now)).toBeNull();
  });
});
