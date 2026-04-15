import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveUserRole } from '@/lib/authHelpers';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [{ role: 'admin' }], error: null })),
      })),
    })),
  },
}));

describe('resolveUserRole', () => {
  it('should return the highest priority role', async () => {
    const role = await resolveUserRole('test-user-id');
    expect(role).toBe('admin');
  });
});
