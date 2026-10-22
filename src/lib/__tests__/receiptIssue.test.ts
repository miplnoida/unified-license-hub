import { describe, it, expect } from 'vitest';
import { canIssueReceipt } from '../receiptIssue';

describe('canIssueReceipt', () => {
  it('allows staff for a completed payment without receipt', () => {
    expect(canIssueReceipt({ isStaff: true, status: 'completed' })).toBe(true);
  });
  it('blocks non-staff', () => {
    expect(canIssueReceipt({ isStaff: false, status: 'completed' })).toBe(false);
  });
  it('blocks unsettled payments', () => {
    expect(canIssueReceipt({ isStaff: true, status: 'pending' })).toBe(false);
  });
  it('blocks when a receipt already exists', () => {
    expect(canIssueReceipt({ isStaff: true, status: 'completed', existingReceipt: 'RCP-1' })).toBe(false);
  });
});
