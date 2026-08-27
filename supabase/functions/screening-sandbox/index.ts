/**
 * Sandbox sanctions / PEP / AML screening provider.
 *
 * Exposes exactly the endpoint shapes the `sanctions_screening` and
 * `aml_screening` connector adapters already build, so the whole Integration
 * Manager path (credential -> adapter -> circuit breaker -> logs) executes for
 * real while no commercial provider is contracted. Replacing this with a live
 * provider is a configuration change on the integration connection: point
 * `base_url` at the provider and rotate the credential. No code changes.
 *
 * Results are DETERMINISTIC from the subject name so demos, tests and
 * re-screens are repeatable. Nothing here is real intelligence — every payload
 * carries `sandbox: true` and the finding provenance records it.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireSandboxCredential } from '../_shared/sandboxAuth.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Stable 0-99 bucket for a subject name. */
function bucket(name: string): number {
  const s = (name || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return h % 100;
}

type Profile = 'sanctioned' | 'pep' | 'adverse' | 'clean';

/**
 * Deterministic subject profile. Explicit name keywords win so a tester can
 * force any outcome; otherwise the name bucket decides.
 */
export function profileFor(name: string): Profile {
  const s = (name || '').toLowerCase();
  if (s.includes('sanction')) return 'sanctioned';
  if (s.includes('pep') || s.includes('minister')) return 'pep';
  if (s.includes('fraud') || s.includes('adverse')) return 'adverse';
  const b = bucket(name);
  if (b < 8) return 'sanctioned';
  if (b < 22) return 'pep';
  if (b < 38) return 'adverse';
  return 'clean';
}

function sanctionsBody(name: string, subjectType: string, searchId: string) {
  const profile = profileFor(name);
  const base = { search_id: searchId, sandbox: true, subject_type: subjectType, screened_at: new Date().toISOString() };
  if (profile === 'sanctioned') {
    return {
      ...base,
      pep: false,
      lists_matched: ['UN', 'OFAC'],
      results: [
        {
          match_id: `${searchId}-1`,
          name,
          score: 0.94,
          list: 'OFAC SDN',
          programme: 'Financial sanctions',
          entity_type: subjectType,
          matched_fields: ['name'],
          source_url: 'https://sanctionslist.example.gov/ofac/sdn',
          remarks: 'Sandbox simulated strong name match on a consolidated sanctions list.',
        },
      ],
    };
  }
  if (profile === 'pep') {
    return {
      ...base,
      pep: true,
      lists_matched: ['PEP'],
      results: [
        {
          match_id: `${searchId}-1`,
          name,
          score: 0.88,
          list: 'PEP register',
          position: 'Senior public official (simulated)',
          entity_type: subjectType,
          matched_fields: ['name'],
          source_url: 'https://pep.example.org/register',
          remarks: 'Sandbox simulated politically exposed person match.',
        },
      ],
    };
  }
  return { ...base, pep: false, lists_matched: [], results: [] };
}

function amlBody(name: string, screeningId: string) {
  const profile = profileFor(name);
  const base = { screening_id: screeningId, sandbox: true, completed_at: new Date().toISOString() };
  if (profile === 'sanctioned' || profile === 'adverse') {
    const score = profile === 'sanctioned' ? 88 : 55;
    return {
      ...base,
      risk_score: score,
      requires_review: true,
      matches: [
        {
          match_id: `${screeningId}-1`,
          title: profile === 'sanctioned'
            ? 'Reported under investigation for sanctions evasion'
            : 'Reported in connection with a fraud investigation',
          category: profile === 'sanctioned' ? 'sanctions' : 'fraud',
          score,
          published_at: '2024-11-04',
          source_url: 'https://news.example.com/archive/regulatory-action',
          excerpt: 'Sandbox simulated adverse-media excerpt for provider-path verification.',
        },
      ],
    };
  }
  return { ...base, risk_score: 0, requires_review: false, matches: [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Path shape: /functions/v1/screening-sandbox/<provider-path>
  const path = url.pathname.split('/screening-sandbox/')[1]?.replace(/^\/+/, '') ?? '';

  if (path === 'health') {
    return json({ status: 'ok', sandbox: true, at: new Date().toISOString() });
  }

  // Canonical gate: provider credential presented by the connector runtime,
  // compared timing-safely against SCREENING_SANDBOX_KEY (fail-closed).
  const gate = requireSandboxCredential(req, 'SCREENING_SANDBOX_KEY', corsHeaders);
  if (!gate.ok) return gate.response;

  try {
    if (req.method === 'POST' && path === 'sanctions/search') {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name ?? '');
      if (!name) return json({ error: 'name is required' }, 400);
      return json(sanctionsBody(name, String(body.type ?? 'individual'), crypto.randomUUID()));
    }

    if (req.method === 'POST' && path === 'screen/individual') {
      const body = await req.json().catch(() => ({}));
      const name = String(body.full_name ?? '');
      if (!name) return json({ error: 'full_name is required' }, 400);
      return json(amlBody(name, crypto.randomUUID()));
    }

    if (req.method === 'POST' && path === 'screen/entity') {
      const body = await req.json().catch(() => ({}));
      const name = String(body.entity_name ?? '');
      if (!name) return json({ error: 'entity_name is required' }, 400);
      return json(amlBody(name, crypto.randomUUID()));
    }

    // Result re-fetch by reference: the sandbox keeps no store, so it echoes a
    // completed empty envelope rather than pretending to have new data.
    if (req.method === 'GET' && path.startsWith('sanctions/')) {
      return json({ search_id: path.slice('sanctions/'.length), sandbox: true, pep: false, lists_matched: [], results: [], screened_at: new Date().toISOString() });
    }
    if (req.method === 'GET' && path.startsWith('screen/')) {
      return json({ screening_id: path.slice('screen/'.length), sandbox: true, risk_score: 0, requires_review: false, matches: [], completed_at: new Date().toISOString() });
    }

    return json({ error: `Unknown sandbox screening endpoint "${req.method} ${path}"` }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
