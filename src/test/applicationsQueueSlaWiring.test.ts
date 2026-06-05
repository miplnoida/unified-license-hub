import { describe, expect, it } from 'vitest';
import {
  APPLICATION_QUEUE_PENDING_STATUSES,
  APPLICATION_QUEUE_SLA_BREACH_DAYS,
  APPLICATION_QUEUE_SLA_DUE_SOON_DAYS,
} from '@/lib/applicationQueueFilters';

describe('application queue SLA wiring', () => {
  it('keeps SQL and dashboard pending status definitions aligned', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605070948_9873c1f3-e883-4c7e-a7bf-b1e275f1efaf.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain("v_submitted_set text[] := ARRAY['submitted','in_progress']");
    expect(APPLICATION_QUEUE_PENDING_STATUSES).toEqual(['submitted', 'in_progress']);
  });

  it('keeps SQL SLA window thresholds aligned with shared constants', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605070948_9873c1f3-e883-4c7e-a7bf-b1e275f1efaf.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain(`interval '${APPLICATION_QUEUE_SLA_BREACH_DAYS} days'`);
    expect(sql).toContain(`interval '${APPLICATION_QUEUE_SLA_DUE_SOON_DAYS} days'`);
  });
});