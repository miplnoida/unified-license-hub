import { describe, it, expect } from 'vitest';

interface ReviewConfig {
  enabled: boolean;
  mode: 'readonly' | 'editable';
}

function shouldShowReviewStep(config: ReviewConfig | null): boolean {
  return !!config?.enabled;
}

function isEditable(config: ReviewConfig | null): boolean {
  return config?.mode === 'editable';
}

describe('Review Acknowledgement Flow', () => {
  it('hides review step when config is null', () => {
    expect(shouldShowReviewStep(null)).toBe(false);
  });

  it('hides review step when disabled', () => {
    expect(shouldShowReviewStep({ enabled: false, mode: 'readonly' })).toBe(false);
  });

  it('shows review step when enabled', () => {
    expect(shouldShowReviewStep({ enabled: true, mode: 'readonly' })).toBe(true);
  });

  it('returns readonly mode correctly', () => {
    expect(isEditable({ enabled: true, mode: 'readonly' })).toBe(false);
  });

  it('returns editable mode correctly', () => {
    expect(isEditable({ enabled: true, mode: 'editable' })).toBe(true);
  });
});
