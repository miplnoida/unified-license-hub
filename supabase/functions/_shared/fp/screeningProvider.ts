/**
 * Fit & Proper — external screening provider mapping.
 *
 * Turns an `invokeIntegration()` result into `fp_findings` rows plus a durable
 * per-check provider outcome. Kept free of Deno/network/database access so the
 * whole decision table is unit-testable.
 *
 * Rules that must never regress:
 *  - a provider hit is a finding awaiting analyst triage (`resolution_status`
 *    'pending'), never an auto-accepted conclusion;
 *  - "screened clean" produces an informational finding so it is
 *    distinguishable from "never screened";
 *  - `not_configured` / transport failure NEVER produce a clean result — they
 *    produce an explicit "check did not complete" outcome;
 *  - severity always carries a `severity_basis` naming the provider and the
 *    score it came from.
 */
// deno-lint-ignore-file no-explicit-any

export type ProviderCheckType = 'sanctions' | 'pep' | 'adverse_media';

export interface ProviderOutcome {
  check_type: ProviderCheckType;
  integration_key: string;
  connection_id: string | null;
  execution_mode: string;
  environment: string | null;
  /** screened_hits | screened_clean | not_configured | failed */
  outcome: 'screened_hits' | 'screened_clean' | 'not_configured' | 'failed';
  provider_reference: string | null;
  hits: number;
  error_category: string | null;
  error_message: string | null;
  correlation_id: string | null;
  retry_queue_id: string | null;
  at: string;
}

export interface MapInput {
  checkType: ProviderCheckType;
  integrationKey: string;
  environment: string | null;
  /** invokeIntegration result (loosely typed on purpose). */
  result: {
    success: boolean;
    executionMode: string;
    connectionId: string | null;
    providerVerified: boolean;
    providerReference: string | null;
    data: any;
    errorCategory: string | null;
    errorMessage: string | null;
    correlationId: string;
    retryQueueId: string | null;
  };
  /** Row fields shared by every finding of this run. */
  base: Record<string, unknown>;
  /** severity_default from the fp_screening_configs row. */
  defaultSeverity?: string | null;
}

export interface MapOutput {
  findings: Record<string, unknown>[];
  outcome: ProviderOutcome;
}

function scoreToSeverity(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.85 || score >= 85) return 'high';
  if (score >= 0.6 || score >= 60) return 'medium';
  return 'low';
}

function pct(score: unknown): number {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

const LABEL: Record<ProviderCheckType, string> = {
  sanctions: 'Sanctions / watchlist',
  pep: 'Politically exposed person',
  adverse_media: 'Adverse media',
};

/** Extract the provider hits relevant to this check type. */
function extractHits(checkType: ProviderCheckType, data: any): any[] {
  if (!data || typeof data !== 'object') return [];
  if (checkType === 'adverse_media') return Array.isArray(data.matches) ? data.matches : [];
  const hits = Array.isArray(data.hits) ? data.hits : [];
  if (checkType === 'pep') {
    // Only PEP-flagged results belong to the PEP check.
    if (!data.isPep && !(Array.isArray(data.listsMatched) && data.listsMatched.includes('PEP'))) return [];
    return hits.filter((h: any) => {
      const list = String(h?.list ?? '').toLowerCase();
      return !list || list.includes('pep');
    });
  }
  return hits.filter((h: any) => {
    const list = String(h?.list ?? '').toLowerCase();
    return !list.includes('pep');
  });
}

export function mapProviderResult(input: MapInput): MapOutput {
  const { checkType, integrationKey, environment, result, base } = input;
  const label = LABEL[checkType];
  const source = `provider:${integrationKey}`;
  const now = new Date().toISOString();

  const outcomeBase = {
    check_type: checkType,
    integration_key: integrationKey,
    connection_id: result.connectionId,
    execution_mode: result.executionMode,
    environment,
    provider_reference: result.providerReference,
    correlation_id: result.correlationId,
    retry_queue_id: result.retryQueueId,
    at: now,
  };

  // ── Provider never answered ────────────────────────────────────────────────
  if (!result.success) {
    const notConfigured = result.errorCategory === 'not_configured';
    const reason = result.errorMessage ?? 'Provider call failed.';
    return {
      outcome: {
        ...outcomeBase,
        outcome: notConfigured ? 'not_configured' : 'failed',
        hits: 0,
        error_category: result.errorCategory,
        error_message: reason,
      },
      findings: [
        {
          ...base,
          check_type: checkType,
          source,
          title: notConfigured
            ? `${label} check not performed — no screening provider configured`
            : `${label} check could not be completed`,
          summary: notConfigured
            ? `No live ${label.toLowerCase()} provider is configured, so no external screening was performed for this individual. Any conclusion must come from manual verification. (${reason})`
            : `The ${label.toLowerCase()} provider call failed and reached no conclusion: ${reason}. Re-run screening or verify manually — this is NOT a clean result.`,
          severity: notConfigured ? 'medium' : 'medium',
          confidence_score: 0,
          resolution_status: 'pending',
          raw_payload: {
            provider: integrationKey,
            environment,
            execution_mode: result.executionMode,
            error_category: result.errorCategory,
            error_message: reason,
            correlation_id: result.correlationId,
            retry_queue_id: result.retryQueueId,
          },
          severity_basis: {
            source: 'external_provider',
            provider: integrationKey,
            reason: notConfigured
              ? 'No external screening provider is configured for this check; the absence of a result is not evidence of a clean subject.'
              : `Provider call failed (${result.errorCategory ?? 'unknown'}). No screening conclusion is available.`,
          },
        },
      ],
    };
  }

  // ── Provider answered ──────────────────────────────────────────────────────
  const data = result.data ?? {};
  const hits = extractHits(checkType, data);
  const providerRef = result.providerReference;
  const listsMatched = Array.isArray(data.listsMatched) ? data.listsMatched : [];
  const sandbox = Boolean(data?.sandbox) || result.executionMode === 'mock' || !result.providerVerified;

  if (hits.length === 0) {
    return {
      outcome: { ...outcomeBase, outcome: 'screened_clean', hits: 0, error_category: null, error_message: null },
      findings: [
        {
          ...base,
          check_type: checkType,
          source,
          title: `${label} screening: no match returned by provider`,
          summary: `External ${label.toLowerCase()} screening completed against provider "${integrationKey}"${
            providerRef ? ` (reference ${providerRef})` : ''
          } and returned no match.${sandbox ? ' Executed against a SANDBOX provider — not a production intelligence source.' : ''}`,
          severity: 'low',
          confidence_score: sandbox ? 20 : 90,
          resolution_status: 'pending',
          raw_payload: {
            provider: integrationKey,
            environment,
            execution_mode: result.executionMode,
            provider_reference: providerRef,
            sandbox,
            correlation_id: result.correlationId,
          },
          severity_basis: {
            source: 'external_provider',
            provider: integrationKey,
            reason: `Provider returned zero matches. Recorded so a screened-clean subject is distinguishable from one that was never screened.${
              sandbox ? ' Sandbox provider — confirm against a production source before relying on it.' : ''
            }`,
          },
        },
      ],
    };
  }

  const findings = hits.map((h: any, i: number) => {
    const scorePct = pct(h?.score ?? data?.riskScore);
    const severity = scoreToSeverity(scorePct);
    const list = h?.list ?? (checkType === 'pep' ? 'PEP register' : null);
    const title = checkType === 'adverse_media'
      ? String(h?.title ?? `${label} match`).slice(0, 240)
      : `${label} match${list ? ` — ${list}` : ''}`.slice(0, 240);
    const detail = [
      h?.programme ? `Programme: ${h.programme}` : null,
      h?.position ? `Position: ${h.position}` : null,
      h?.category ? `Category: ${h.category}` : null,
      Array.isArray(h?.matched_fields) && h.matched_fields.length ? `Matched on: ${h.matched_fields.join(', ')}` : null,
      h?.excerpt ?? h?.remarks ?? null,
    ].filter(Boolean).join(' · ');

    const citations = h?.source_url
      ? [{ source_url: String(h.source_url).slice(0, 500), excerpt: String(h?.excerpt ?? h?.remarks ?? '').slice(0, 400), published_at: h?.published_at ?? null }]
      : [];

    return {
      ...base,
      check_type: checkType,
      source,
      title,
      summary: `Provider "${integrationKey}" returned a ${scorePct}% match for this individual. ${detail}`.slice(0, 500),
      severity,
      confidence_score: scorePct,
      resolution_status: 'pending',
      citations,
      raw_payload: {
        provider: integrationKey,
        environment,
        execution_mode: result.executionMode,
        provider_reference: providerRef,
        match_reference: h?.match_id ?? null,
        match_score_pct: scorePct,
        lists_matched: listsMatched,
        sandbox,
        correlation_id: result.correlationId,
        provider_match: h,
      },
      severity_basis: {
        source: 'external_provider',
        provider: integrationKey,
        match_score_pct: scorePct,
        lists_matched: listsMatched,
        reason: `Severity derived from the provider's ${scorePct}% match score${
          list ? ` on "${list}"` : ''
        } — not a human or LLM judgement. Awaiting analyst triage.${
          sandbox ? ' Executed against a SANDBOX provider.' : ''
        }`,
        hit_index: i,
      },
    };
  });

  return {
    outcome: { ...outcomeBase, outcome: 'screened_hits', hits: findings.length, error_category: null, error_message: null },
    findings,
  };
}

/** Adapter + operation + payload for a check type. */
export function providerCallFor(
  checkType: ProviderCheckType,
  person: { full_name: string; nationality?: string | null; date_of_birth?: string | null; national_id?: string | null },
  reference: string,
): { integrationKey: string; operation: string; payload: Record<string, unknown> } | null {
  switch (checkType) {
    case 'sanctions':
      return {
        integrationKey: 'sanctions_screening',
        operation: 'screen',
        payload: {
          name: person.full_name,
          subjectType: 'individual',
          dateOfBirth: person.date_of_birth ?? null,
          country: person.nationality ?? null,
          lists: ['UN', 'OFAC', 'EU', 'UK_HMT'],
          threshold: 0.85,
          reference,
        },
      };
    case 'pep':
      return {
        integrationKey: 'sanctions_screening',
        operation: 'screen',
        payload: {
          name: person.full_name,
          subjectType: 'individual',
          dateOfBirth: person.date_of_birth ?? null,
          country: person.nationality ?? null,
          lists: ['PEP'],
          threshold: 0.8,
          reference,
        },
      };
    case 'adverse_media':
      return {
        integrationKey: 'aml_screening',
        operation: 'screen_individual',
        payload: {
          fullName: person.full_name,
          dateOfBirth: person.date_of_birth ?? null,
          nationality: person.nationality ?? null,
          reference,
        },
      };
    default:
      return null;
  }
}
