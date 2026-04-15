import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateEnv } from '@/lib/envValidation';

describe('validateEnv', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    // vitest will already have env set from .env
  });

  it('should not throw when env vars are present', () => {
    expect(() => validateEnv()).not.toThrow();
  });
});
