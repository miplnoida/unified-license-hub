import { describe, expect, it } from 'vitest';
import { ACTION_BUCKETS, sourceLink } from '@/hooks/usePrudentialActionLifecycle';

const base = { entity_id: 'e1' };

describe('supervisory action drill-through', () => {
  it('links an assessment source to the assessment', () => {
    expect(sourceLink({ ...base, source_type: 'assessment', source_id: 'a1' })).toBe('/prudential/assessments/a1');
  });

  it('links an escalation source to the escalation register', () => {
    expect(sourceLink({ ...base, source_type: 'escalation', source_id: 'x1' })).toBe('/prudential/escalations');
  });

  it('links an examination finding to the examinations register', () => {
    expect(sourceLink({ ...base, source_type: 'examination_finding', source_id: 'f1' })).toBe('/prudential/examinations');
  });

  it('falls back to the entity profile for return breaches and stress indicators', () => {
    expect(sourceLink({ ...base, source_type: 'return_breach', source_id: 'r1' })).toBe('/entities/e1?view=prudential');
    expect(sourceLink({ ...base, source_type: 'stress_indicator', source_id: 's1' })).toBe('/entities/e1?view=prudential');
  });


  it('returns null when there is no source and no entity', () => {
    expect(sourceLink({ entity_id: null, source_type: 'manual', source_id: null })).toBeNull();
  });
});

describe('monitoring buckets', () => {
  it('exposes the seven FRD buckets in order', () => {
    expect(ACTION_BUCKETS.map((b) => b.key)).toEqual([
      'open',
      'due_soon',
      'overdue',
      'breached',
      'awaiting_evidence',
      'awaiting_review',
      'completed',
    ]);
  });
});
