/**
 * P12 correspondence convergence + P08 closure guardrails.
 *
 * The correspondence work queue and thread workspace must read only the governed
 * server read models (no browser table reads, no client SLA/priority arithmetic,
 * no capped client arrays), and the legacy duplicate screens must be retired.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

const BUSINESS_TABLES = [
  'correspondence_threads',
  'correspondence_messages',
  'correspondence_attachments',
  'correspondence_dispatches',
  'correspondence_events',
];

describe('P12 correspondence convergence', () => {
  const hook = read('src/hooks/useCorrespondenceQueue.ts');
  const queue = read('src/pages/correspondence/CorrespondenceInbox.tsx');
  const workspace = read('src/pages/correspondence/ThreadWorkspace.tsx');
  const entityList = read('src/pages/entity/correspondence/MyCorrespondence.tsx');

  it('reads correspondence only through governed read models', () => {
    for (const t of BUSINESS_TABLES) {
      for (const src of [hook, queue, workspace, entityList]) {
        expect(src).not.toContain(`from('${t}')`);
      }
    }
    expect(hook).toContain('correspondence_work_queue');
    expect(hook).toContain('correspondence_thread_case');
  });

  it('is server-paged and server-counted', () => {
    expect(queue).toContain("mode=\"server\"");
    expect(queue).toContain('totalCount={data?.total ?? 0}');
    expect(queue).toContain('counts[b.countKey]');
    expect(entityList).toContain('useCorrespondenceWorkQueue');
  });

  it('does not compute SLA, priority or next action in the browser', () => {
    for (const src of [queue, workspace, entityList]) {
      expect(src).not.toMatch(/Date\.now\(\)/);
      expect(src).not.toMatch(/sla_due_at\).getTime/);
    }
  });

  it('renders the canonical case header contract on the thread workspace', () => {
    expect(workspace).toContain('CaseHeader');
    expect(workspace).toContain('caseHeaderSlaState(model.sla_state)');
    expect(workspace).toContain('model.next_action');
    expect(workspace).toContain('model.waiting_on');
    expect(workspace).toContain('related_case');
    expect(workspace).toContain('delivery_evidence');
    expect(workspace).toContain('rfi_links');
  });

  it('retires the duplicate correspondence screens', () => {
    expect(existsSync('src/pages/correspondence/CorrespondenceManager.tsx')).toBe(false);
    expect(existsSync('src/pages/correspondence/CorrespondenceDetail.tsx')).toBe(false);
    const routes = read('src/routes/dashboardRoutes.tsx');
    expect(routes).toContain('<Route path="/correspondence/manager" element={<Navigate to="/correspondence/inbox" replace />} />');
    expect(routes).toContain('ThreadWorkspace');
  });

  it('routes correspondence notifications to the canonical thread workspace', () => {
    const links = read('src/lib/notificationLinks.ts');
    expect(links).not.toContain('/correspondence/manager?thread=');
    expect(links).toContain('correspondence_thread: (id) => `/correspondence/${id}`');
  });
});

describe('P08 closure guardrails', () => {
  const panel = read('src/components/conduct/ConductRelatedCasesPanel.tsx');
  const investigation = read('src/pages/conduct/InvestigationDetail.tsx');

  it('reads conduct related cases from the governed RPC only', () => {
    expect(panel).toContain('conduct_related_cases');
    for (const t of ['conduct_investigations', 'conduct_findings', 'conduct_alerts', 'enforcement_actions', 'complaints']) {
      expect(panel).not.toContain(`from('${t}')`);
    }
  });

  it('surfaces related cases and canonical correspondence on the investigation case', () => {
    expect(investigation).toContain('ConductRelatedCasesPanel');
    expect(investigation).toContain('CaseThreadsPanel');
    expect(investigation).toContain('sourceType="conduct_investigation"');
    expect(investigation).toContain('caseType="conduct_investigation"');
  });

  it('retires the conduct-only entity profile in favour of the canonical entity', () => {
    expect(existsSync('src/pages/conduct/ConductEntityProfile.tsx')).toBe(false);
    expect(read('src/routes/dashboardRoutes.tsx')).toContain('ConductEntityRedirect');
    expect(read('src/routes/ConductEntityRedirect.tsx')).toContain('/entities/');
  });
});
