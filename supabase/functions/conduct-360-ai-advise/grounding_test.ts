// MC-07.4 — targeted grounding tests.
// Run: deno test supabase/functions/conduct-360-ai-advise/grounding_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkGrounding, collectCitedReferences, resolveCitations } from './grounding.ts';

const permitted = [
  { section: 'complaints', reference: 'CMP-2026-000087', href: '/complaints/1' },
  { section: 'patterns', reference: 'PAT-2026-000002', href: '/conduct/patterns/2' },
];

Deno.test('citations are collected from every part of the advisory output', () => {
  const refs = collectCitedReferences({
    cited_references: ['CMP-2026-000087'],
    sections: [{ cited_references: ['PAT-2026-000002'] }],
    questions: [{ cited_references: ['CMP-2026-000087'] }],
    hypotheses: [{ cited_references: ['PAT-2026-000002'] }],
    records: [{ reference: 'CMP-2026-000087' }],
  }).sort();
  assertEquals(refs, ['CMP-2026-000087', 'PAT-2026-000002']);
});

Deno.test('references present in the governed context are accepted', () => {
  const r = checkGrounding({ cited_references: ['CMP-2026-000087', 'PAT-2026-000002'] }, permitted);
  assertEquals(r.invented, []);
  assertEquals(r.cited.length, 2);
});

Deno.test('an invented record reference is detected', () => {
  const r = checkGrounding({ cited_references: ['CMP-2026-999999'] }, permitted);
  assertEquals(r.invented, ['CMP-2026-999999']);
  assertEquals(r.cited, []);
});

Deno.test('a reformatted or partial reference is not accepted as a citation', () => {
  const r = checkGrounding({ sections: [{ cited_references: ['CMP 2026 000087', 'cmp-2026-000087'] }] }, permitted);
  assertEquals(r.invented.length, 2);
});

Deno.test('an invented reference inside records-to-review is detected', () => {
  const r = checkGrounding({ records: [{ reference: 'SIG-2026-000123', reason_to_review: 'x' }] }, permitted);
  assertEquals(r.invented, ['SIG-2026-000123']);
});

Deno.test('citations resolve back to the context entries used for drill-down', () => {
  const resolved = resolveCitations(['PAT-2026-000002'], permitted);
  assertEquals(resolved.length, 1);
  assertEquals(resolved[0].href, '/conduct/patterns/2');
});

Deno.test('output with no citations yields no cited references', () => {
  const r = checkGrounding({ advisory_text: 'Nothing cited.' }, permitted);
  assertEquals(r.cited, []);
  assertEquals(r.invented, []);
});
