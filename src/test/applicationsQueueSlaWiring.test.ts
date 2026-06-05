import { describe, expect, it } from 'vitest';
import {
  APPLICATION_QUEUE_PENDING_STATUSES,
  APPLICATION_QUEUE_RETURNED_STATUSES,
  APPLICATION_QUEUE_SLA_BREACH_DAYS,
  APPLICATION_QUEUE_SLA_DUE_SOON_DAYS,
} from '@/lib/applicationQueueFilters';

describe('application queue SLA / status-group wiring', () => {
  it('keeps SQL and dashboard pending status definitions aligned', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605075102_6fd50653-ae9a-486a-9b0c-a415cee2048c.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain("v_submitted_set text[] := ARRAY['submitted','in_progress']");
    expect(APPLICATION_QUEUE_PENDING_STATUSES).toEqual(['submitted', 'in_progress']);
  });

  it('keeps SQL returned-group definition aligned', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605075102_6fd50653-ae9a-486a-9b0c-a415cee2048c.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain("v_returned_set text[] := ARRAY['resubmission_requested','query_raised']");
    expect(APPLICATION_QUEUE_RETURNED_STATUSES).toEqual(['resubmission_requested', 'query_raised']);
  });

  it('keeps SQL SLA window thresholds aligned with shared constants', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605075102_6fd50653-ae9a-486a-9b0c-a415cee2048c.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain(`interval '${APPLICATION_QUEUE_SLA_BREACH_DAYS} days'`);
    expect(sql).toContain(`interval '${APPLICATION_QUEUE_SLA_DUE_SOON_DAYS} days'`);
  });

  it('exposes status_group support in SQL', async () => {
    const sqlModule = await import('../../supabase/migrations/20260605075102_6fd50653-ae9a-486a-9b0c-a415cee2048c.sql?raw');
    const sql = sqlModule.default as string;

    expect(sql).toContain('_status_group');
    expect(sql).toContain("v_status_group = 'returned'");
    expect(sql).toContain("v_status_group = 'pending'");
  });
});
