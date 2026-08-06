/**
 * Fit & Proper external screening mapping — decision table tests.
 *
 * The invariants asserted here are the ones that protect a regulatory
 * conclusion: a broken or unconfigured check must never look clean, provider
 * hits must land as pending triage items, and severity must always be
 * attributable to the provider score.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { mapProviderResult, providerCallFor } from '../_shared/fp/screeningProvider.ts';

const base = { assessment_id: 'a1', individual_id: 'i1', run_id: 'r1' };

function result(over: Record<string, unknown> = {}) {
  return {
    success: true,
    executionMode: 'live',
    connectionId: 'c1',
    providerVerified: false,
    providerReference: 'ref-1',
    data: {},
    errorCategory: null,
    errorMessage: null,
    correlationId: 'corr-1',
    retryQueueId: null,
    ...over,
  } as never;
}

Deno.test('not_configured never yields a clean result', () => {
  const out = mapProviderResult({
    checkType: 'sanctions',
    integrationKey: 'sanctions_screening',
    environment: 'sandbox',
    result: result({ success: false, errorCategory: 'not_configured', errorMessage: 'no connection' }),
    base,
  });
  assertEquals(out.outcome.outcome, 'not_configured');
  assertEquals(out.findings.length, 1);
  assertEquals(out.findings[0].resolution_status, 'pending');
  assert(String(out.findings[0].title).includes('not performed'));
});

Deno.test('transport failure is recorded as failed, not clean', () => {
  const out = mapProviderResult({
    checkType: 'adverse_media',
    integrationKey: 'aml_screening',
    environment: 'sandbox',
    result: result({ success: false, errorCategory: 'server', errorMessage: 'HTTP 502' }),
    base,
  });
  assertEquals(out.outcome.outcome, 'failed');
  assert(String(out.findings[0].summary).includes('NOT a clean result'));
});

Deno.test('zero provider hits produce an explicit screened-clean record', () => {
  const out = mapProviderResult({
    checkType: 'sanctions',
    integrationKey: 'sanctions_screening',
    environment: 'sandbox',
    result: result({ data: { hits: [], listsMatched: [], sandbox: true } }),
    base,
  });
  assertEquals(out.outcome.outcome, 'screened_clean');
  assertEquals(out.outcome.hits, 0);
  assertEquals(out.findings.length, 1);
  assertEquals(out.findings[0].severity, 'low');
  assert(String(out.findings[0].summary).includes('SANDBOX'));
});

Deno.test('sanctions hit becomes a pending high-severity triage finding', () => {
  const out = mapProviderResult({
    checkType: 'sanctions',
    integrationKey: 'sanctions_screening',
    environment: 'prod',
    result: result({
      providerVerified: true,
      data: {
        hits: [{ match_id: 'm1', list: 'OFAC SDN', score: 0.94, source_url: 'https://x/y', excerpt: 'e' }],
        listsMatched: ['OFAC'],
        isPep: false,
      },
    }),
    base,
  });
  assertEquals(out.outcome.outcome, 'screened_hits');
  assertEquals(out.outcome.hits, 1);
  const f = out.findings[0] as Record<string, unknown>;
  assertEquals(f.severity, 'high');
  assertEquals(f.confidence_score, 94);
  assertEquals(f.resolution_status, 'pending');
  assertEquals((f.severity_basis as Record<string, unknown>).source, 'external_provider');
  assertEquals((f.raw_payload as Record<string, unknown>).match_score_pct, 94);
});

Deno.test('PEP check ignores non-PEP list hits and vice versa', () => {
  const data = {
    hits: [
      { match_id: 'm1', list: 'OFAC SDN', score: 0.9 },
      { match_id: 'm2', list: 'PEP register', score: 0.87 },
    ],
    listsMatched: ['OFAC', 'PEP'],
    isPep: true,
  };
  const pep = mapProviderResult({ checkType: 'pep', integrationKey: 'sanctions_screening', environment: null, result: result({ data }), base });
  assertEquals(pep.outcome.hits, 1);
  assertEquals((pep.findings[0].raw_payload as Record<string, unknown>).match_reference, 'm2');

  const sanc = mapProviderResult({ checkType: 'sanctions', integrationKey: 'sanctions_screening', environment: null, result: result({ data }), base });
  assertEquals(sanc.outcome.hits, 1);
  assertEquals((sanc.findings[0].raw_payload as Record<string, unknown>).match_reference, 'm1');
});

Deno.test('PEP check stays clean when provider did not flag a PEP', () => {
  const out = mapProviderResult({
    checkType: 'pep',
    integrationKey: 'sanctions_screening',
    environment: null,
    result: result({ data: { hits: [{ list: 'OFAC SDN', score: 0.9 }], listsMatched: ['OFAC'], isPep: false } }),
    base,
  });
  assertEquals(out.outcome.outcome, 'screened_clean');
});

Deno.test('adverse-media matches map with citations', () => {
  const out = mapProviderResult({
    checkType: 'adverse_media',
    integrationKey: 'aml_screening',
    environment: 'sandbox',
    result: result({ data: { matches: [{ title: 'Fraud probe', score: 55, source_url: 'https://n/1', excerpt: 'x', published_at: '2024-01-01' }], riskScore: 55, sandbox: true } }),
    base,
  });
  assertEquals(out.outcome.outcome, 'screened_hits');
  assertEquals(out.findings[0].severity, 'low');
  assertEquals((out.findings[0].citations as unknown[]).length, 1);
});

Deno.test('provider call routing per check type', () => {
  const person = { full_name: 'Jane Doe', nationality: 'JM', date_of_birth: '1980-01-01' };
  assertEquals(providerCallFor('sanctions', person, 'ref')?.integrationKey, 'sanctions_screening');
  assertEquals(providerCallFor('pep', person, 'ref')?.integrationKey, 'sanctions_screening');
  assertEquals(providerCallFor('adverse_media', person, 'ref')?.integrationKey, 'aml_screening');
  assertEquals(providerCallFor('adverse_media', person, 'ref')?.operation, 'screen_individual');
});
