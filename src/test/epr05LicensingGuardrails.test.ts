import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const queue = readFileSync('src/pages/applications/ApplicationQueue.tsx', 'utf8');
const detail = readFileSync('src/pages/applications/ApplicationDetail.tsx', 'utf8');
const newApp = readFileSync('src/pages/NewApplication.tsx', 'utf8');
const gatesPanel = readFileSync('src/components/applications/DecisionGatesPanel.tsx', 'utf8');

describe('EPR-05 licensing guardrails', () => {
  it('queue does not reintroduce client SLA or priority authority', () => {
    expect(queue).not.toMatch(/SLA_TARGET_DAYS/);
    expect(queue).not.toMatch(/effectivePriority/);
    // Operational rows come from the server read model, never a capped table fetch.
    expect(queue).toContain('useApplicationWorkQueue');
    expect(queue).not.toMatch(/from\('applications'\)[\s\S]{0,400}\.limit\(500\)/);
  });

  it('queue paging and KPIs read server totals, not rows.length', () => {
    expect(queue).toContain('queueQuery.data?.total');
    expect(queue).toContain('useApplicationQueueCounts');
    expect(queue).not.toMatch(/rows\.length\s*\/\s*PAGE_SIZE/);
  });

  it('form applicability is resolved by the server, not the browser', () => {
    expect(detail).not.toContain('resolveMatchedTemplateIds');
    expect(detail).toContain('applicationClassificationUpdate');
    expect(newApp).toContain('application_resolve_form_set');
    // The wizard's template list is derived from the server payload, not local taxonomy matching.
    expect(newApp).toMatch(/matchedTemplates = useMemo\(\(\) => \{\s*\n\s*const items[^\n]*serverFormSet/);
    expect(newApp).not.toMatch(/formTemplates\.filter\([\s\S]{0,300}(sector_id|sub_sector_id|category_id)\s*===/);
  });

  it('no direct browser DML on authoritative application columns or approval tables', () => {
    for (const source of [queue, detail, newApp]) {
      expect(source).not.toMatch(/from\(['"]approval_actions['"]\)\s*\.\s*(insert|update|delete|upsert)/);
      expect(source).not.toMatch(/from\(['"]approval_step_actions['"]\)\s*\.\s*(insert|update|delete|upsert)/);
      expect(source).not.toMatch(/from\(['"]applications['"]\)[\s\S]{0,200}\.update\(\{[\s\S]{0,300}(status|priority|assigned_to|approved_at|rejected_at|cancelled_at|current_step_id)\s*:/);
      expect(source).not.toMatch(/from\(['"]licenses['"]\)\s*\.\s*(insert|update|delete|upsert)/);
    }
  });

  it('decision eligibility is displayed from the canonical server gate source', () => {
    expect(gatesPanel).toContain('decision_gate_status');
    // No locally recomputed gate verdicts.
    expect(gatesPanel).not.toMatch(/blockerCount\s*>\s*0\s*\?\s*false/);
  });
});
