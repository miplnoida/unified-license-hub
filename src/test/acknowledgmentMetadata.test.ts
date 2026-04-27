import { describe, it, expect } from 'vitest';

/**
 * Mirrors the ack persistence in verify-and-submit edge function.
 * When ack_text is provided, the function persists ack_by/ack_at/ack_text
 * onto the application row alongside the status update.
 */
function buildSubmitUpdate(userId: string, submittedAt: string, ackText?: string) {
  const base = { status: 'submitted', submitted_at: submittedAt };
  if (!ackText) return base;
  return {
    ...base,
    ack_by: userId,
    ack_at: submittedAt,
    ack_text: String(ackText).slice(0, 4000),
  };
}

describe('Acknowledgment metadata persistence', () => {
  const userId = 'user-1';
  const ts = '2026-04-27T10:00:00.000Z';

  it('writes only status fields when no ack provided', () => {
    const u = buildSubmitUpdate(userId, ts);
    expect(u).toEqual({ status: 'submitted', submitted_at: ts });
    expect((u as Record<string, unknown>).ack_by).toBeUndefined();
  });

  it('writes ack metadata when ack_text provided', () => {
    const u = buildSubmitUpdate(userId, ts, 'I confirm details are accurate.');
    expect(u).toMatchObject({
      status: 'submitted',
      submitted_at: ts,
      ack_by: userId,
      ack_at: ts,
      ack_text: 'I confirm details are accurate.',
    });
  });

  it('truncates ack_text longer than 4000 chars', () => {
    const long = 'x'.repeat(5000);
    const u = buildSubmitUpdate(userId, ts, long) as { ack_text: string };
    expect(u.ack_text.length).toBe(4000);
  });

  it('uses submission timestamp for ack_at (single-source-of-truth)', () => {
    const u = buildSubmitUpdate(userId, ts, 'ok') as { ack_at: string; submitted_at: string };
    expect(u.ack_at).toBe(u.submitted_at);
  });
});
