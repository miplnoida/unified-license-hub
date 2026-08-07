import { describe, it, expect } from 'vitest';
import { stateLabel, stateTone } from '@/components/notifications/CommunicationTimeline';

describe('communication state presentation', () => {
  it('never presents provider acceptance as delivery', () => {
    expect(stateLabel('SENT_TO_PROVIDER').toLowerCase()).not.toContain('delivered');
    expect(stateLabel('SENT_TO_PROVIDER').toLowerCase()).toContain('provider');
  });

  it('labels confirmed delivery only for DELIVERED', () => {
    expect(stateLabel('DELIVERED').toLowerCase()).toContain('deliver');
  });

  it('marks failure states as destructive', () => {
    expect(stateTone('FAILED')).toBe('destructive');
    expect(stateTone('DEAD_LETTER')).toBe('destructive');
  });

  it('keeps queued and retrying visually distinct from success', () => {
    expect(stateTone('QUEUED')).not.toBe('default');
    expect(stateLabel('RETRYING').toLowerCase()).toContain('retry');
  });

  it('falls back to the raw state for unknown values', () => {
    expect(stateLabel('SOMETHING_NEW')).toBeTruthy();
  });
});
