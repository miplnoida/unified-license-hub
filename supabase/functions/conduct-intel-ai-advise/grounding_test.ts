// MC-09 — Grounding enforcement tests for the cross-entity advisory boundary.
//
// These prove the rule that matters for certification: a reference the model did
// not receive in the governed context can never survive into a recorded advisory.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkGrounding, collectCitedReferences, resolveCitations } from './grounding.ts';
import { INTEL_USE_CASE_CODES } from './prompts.ts';

const permitted = [
  { section: 'complaints', reference: 'CMP-2026-0001', href: '/complaints/1' },
  { section: 'signals', reference: 'SIG-2026-0007', href: '/conduct/signals/7' },
];

Deno.test('cited references are collected from every advisory shape', () => {
  const cited = collectCitedReferences({
    cited_references: ['CMP-2026-0001'],
    sections: [{ heading: 'A', text: 'x', cited_references: ['SIG-2026-0007'] }],
    questions: [{ question: 'q', cited_references: ['CMP-2026-0001'] }],
    hypotheses: [{ hypothesis: 'h', cited_references: ['SIG-2026-0007'] }],
    records: [{ reference: 'CMP-2026-0001' }],
  });
  assertEquals(cited.sort(), ['CMP-2026-0001', 'SIG-2026-0007']);
});

Deno.test('a reference outside the governed context is reported as invented', () => {
  const r = checkGrounding({ cited_references: ['CMP-2026-0001', 'CMP-9999-0000'] }, permitted);
  assertEquals(r.cited, ['CMP-2026-0001']);
  assertEquals(r.invented, ['CMP-9999-0000']);
});

Deno.test('an external URL is never accepted as a citation', () => {
  const r = checkGrounding({ cited_references: ['https://example.com/report.pdf'] }, permitted);
  assertEquals(r.cited, []);
  assertEquals(r.invented, ['https://example.com/report.pdf']);
});

Deno.test('a reformatted reference is rejected rather than matched loosely', () => {
  const r = checkGrounding({ cited_references: ['cmp 2026 0001'] }, permitted);
  assertEquals(r.cited.length, 0);
  assertEquals(r.invented.length, 1);
});

Deno.test('citations resolve only to permitted context entries with drill-through', () => {
  const resolved = resolveCitations(['SIG-2026-0007', 'CMP-9999-0000'], permitted);
  assertEquals(resolved.length, 1);
  assertEquals(resolved[0].href, '/conduct/signals/7');
});

Deno.test('exactly the five approved MC-09 capabilities are executable', () => {
  assertEquals([...INTEL_USE_CASE_CODES].sort(), [
    'CROSS_ENTITY_INTERPRETATION',
    'EMERGING_RISK_HYPOTHESIS',
    'EMERGING_RISK_NARRATIVE',
    'SECTOR_SUPERVISORY_QUESTIONS',
    'THEME_MATERIAL_CHANGE',
  ]);
});
