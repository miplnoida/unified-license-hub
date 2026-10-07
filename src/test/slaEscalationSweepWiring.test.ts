/**
 * AML-CLOSE-08B — the live SLA escalation worker uses the canonical engine only.
 * Source-contract test: the worker is never executed, so no notification can be sent.
 * Breach/escalation behaviour itself is proven by scripts/verify-pcomp-r2d-sla-policy.sql (rollback).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../supabase/functions/sla-escalation-sweep/index.ts'), 'utf-8');

describe('sla-escalation-sweep wiring', () => {
  it('breaches only active overdue stages through sla_stage_mark_breached and notifies only on a real transition', () => {
    expect(src).toMatch(/\.eq\("state", "active"\)[\s\S]*?\.lt\("due_at", nowIso\)/);
    expect(src).toMatch(/admin\.rpc\(\s*"sla_stage_mark_breached"/);
    expect(src).toMatch(/if \(didBreach !== true\) continue;[\s\S]*?event_key: "workflow\.sla_breached"/);
    expect(src).not.toMatch(/\.update\(\{\s*state:/);
  });

  it('escalates by sla_escalation_tiers, one dispatch per workflow instance and tier, then records stage evidence', () => {
    expect(src).toMatch(/\.from\("sla_escalation_tiers"\)/);
    expect(src).toMatch(/alreadySent\.has\(`\$\{stage\.workflow_instance_id\}::\$\{tier\.tier\}`\)/);
    expect(src).toMatch(/\.from\("sla_escalation_dispatches"\)\s*\.insert\(/);
    expect(src).toMatch(/code !== "23505"\)[\s\S]*?continue;/);
    expect(src).toMatch(/event_key: "workflow\.sla_escalation"/);
    expect(src).toMatch(/admin\.rpc\("sla_stage_mark_escalated"/);
  });

  it('has no notification bypass switch and no AML-specific escalation path', () => {
    expect(src).not.toMatch(/skipNotifications|skip_notifications|dryRun|dry_run/i);
    expect(src).not.toMatch(/AML_CFT|supervisory_response_sla/);
  });
});
