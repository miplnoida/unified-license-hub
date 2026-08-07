/**
 * Phase 1 / LIC-DEC-001 — end-to-end decision-gate refusal.
 *
 * The mandatory decision gate lives in the real approval path
 * (`perform-workflow-action`), so it cannot be proven from pgTAP. This test
 * imports the actual handler and drives it against a live Supabase stack:
 *
 *   1. seed an application on a terminal approval step with an OPEN RFI;
 *   2. call the handler as an authenticated super_admin approver with
 *      action_type = "approve"  ->  MUST be refused with 422
 *      DECISION_GATES_UNMET, the application status MUST be unchanged, and an
 *      ACCESS_DENIED security event MUST be written;
 *   3. resolve the gate (close the RFI, record a clean sufficiency evaluation)
 *      ->  the same call MUST no longer be refused for gate reasons.
 *
 * Requires a live stack. In CI the db-tests job exports SUPABASE_URL /
 * SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from `supabase status` and sets
 * PHASE1_E2E=1, which makes the test mandatory instead of skipped.
 */
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const REQUIRED = Deno.env.get('PHASE1_E2E') === '1';
const HAVE_STACK = !!(SUPABASE_URL && SERVICE_KEY && ANON_KEY);

if (REQUIRED && !HAVE_STACK) {
  throw new Error(
    'PHASE1_E2E=1 but SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not set',
  );
}

const suffix = crypto.randomUUID().slice(0, 8);
const APPROVER_EMAIL = `phase1.approver.${suffix}@example.test`;
const APPLICANT_EMAIL = `phase1.applicant.${suffix}@example.test`;
const PASSWORD = `Phase1!${suffix}Aa`;

interface Seed {
  approverId: string;
  accessToken: string;
  applicationId: string;
  stepId: string;
  instanceId: string | null;
  rfiId: string;
}

async function seed(): Promise<Seed> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: approver, error: approverErr } = await admin.auth.admin.createUser({
    email: APPROVER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (approverErr) throw approverErr;
  const approverId = approver!.user!.id;

  const { data: applicant, error: applicantErr } = await admin.auth.admin.createUser({
    email: APPLICANT_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (applicantErr) throw applicantErr;
  const applicantId = applicant!.user!.id;

  const { error: roleErr } = await admin
    .from('user_roles')
    .insert({ user_id: approverId, role: 'super_admin' });
  if (roleErr) throw roleErr;

  // Application awaiting a final decision.
  const { data: app, error: appErr } = await admin
    .from('applications')
    .insert({
      applicant_id: applicantId,
      license_type: `Phase1 Gate Licence ${suffix}`,
      status: 'under_review',
    })
    .select('id, status')
    .single();
  if (appErr) throw appErr;

  // Minimal single-step (terminal) workflow.
  const { data: wf, error: wfErr } = await admin
    .from('approval_workflows')
    .insert({ name: `Phase1 Gate Workflow ${suffix}`, is_active: true })
    .select('id')
    .single();
  if (wfErr) throw wfErr;

  const { data: step, error: stepErr } = await admin
    .from('approval_steps')
    .insert({
      workflow_id: (wf as any).id,
      name: 'Final Decision',
      step_order: 1,
      is_terminal: true,
      allowed_actions: ['approve', 'reject'],
    })
    .select('id')
    .single();
  if (stepErr) throw stepErr;

  // Blocking gate: an OPEN request for information.
  const { data: rfi, error: rfiErr } = await admin
    .from('application_rfis')
    .insert({
      application_id: (app as any).id,
      status: 'open',
      subject: 'Phase 1 gate probe — outstanding information',
    })
    .select('id')
    .single();
  if (rfiErr) throw rfiErr;

  // Workflow instance, when the schema exposes one for this application.
  let instanceId: string | null = null;
  const { data: inst } = await admin
    .from('workflow_instances')
    .insert({
      application_id: (app as any).id,
      workflow_id: (wf as any).id,
      current_step_id: (step as any).id,
      status: 'in_progress',
    })
    .select('id')
    .maybeSingle();
  instanceId = (inst as any)?.id ?? null;

  // Authenticate as the approver.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email: APPROVER_EMAIL,
    password: PASSWORD,
  });
  if (signInErr) throw signInErr;

  return {
    approverId,
    accessToken: session!.session!.access_token,
    applicationId: (app as any).id,
    stepId: (step as any).id,
    instanceId,
    rfiId: (rfi as any).id,
  };
}

function approveRequest(s: Seed): Request {
  return new Request('http://localhost/perform-workflow-action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${s.accessToken}`,
    },
    body: JSON.stringify({
      application_id: s.applicationId,
      step_id: s.stepId,
      instance_id: s.instanceId,
      action_type: 'approve',
      comments: 'Phase 1 gate probe',
    }),
  });
}

Deno.test({
  name: 'LIC-DEC-001 final approval is refused while a blocking decision gate is unmet',
  ignore: !HAVE_STACK,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { handler } = await import('../perform-workflow-action/index.ts');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const s = await seed();

    // The gate itself reports the application as not decision-ready.
    const { data: gate } = await admin.rpc('decision_gate_status', {
      _application_id: s.applicationId,
    });
    assertEquals((gate as any).ready, false, 'gate status must report not-ready');
    assert(
      ((gate as any).gates ?? []).some((g: any) => g.key === 'open_rfis' && g.blocking && !g.passed),
      'open RFI must be reported as an unmet blocking gate',
    );

    // 1. Real approval path must refuse.
    const refused = await handler(approveRequest(s));
    const refusedBody = await refused.json();
    assertEquals(refused.status, 422, `expected 422, got ${refused.status}: ${JSON.stringify(refusedBody)}`);
    assertEquals(refusedBody.code, 'DECISION_GATES_UNMET');
    assert(
      (refusedBody.details?.gates ?? []).some((g: any) => g.key === 'open_rfis'),
      'refusal must name the unmet gate',
    );

    // Application status is untouched by the refused decision.
    const { data: afterRefusal } = await admin
      .from('applications')
      .select('status')
      .eq('id', s.applicationId)
      .single();
    assertEquals((afterRefusal as any).status, 'under_review', 'refused approval must not advance the application');

    // The refusal is auditable.
    const { data: secEvents } = await admin
      .from('security_event_logs')
      .select('id, event_type, detail')
      .eq('target_resource', `application:${s.applicationId}:final_decision`);
    assert((secEvents ?? []).length >= 1, 'refusal must write a security event');
    assertEquals((secEvents as any)[0].event_type, 'ACCESS_DENIED');

    // 2. Resolve the gate, then the same call must no longer be gate-refused.
    const { error: closeErr } = await admin
      .from('application_rfis')
      .update({ status: 'closed' })
      .eq('id', s.rfiId);
    if (closeErr) throw closeErr;

    const { data: evaluation } = await admin
      .from('sufficiency_evaluations')
      .insert({ application_id: s.applicationId })
      .select('id')
      .maybeSingle();
    assert(evaluation, 'a clean sufficiency evaluation is required to clear the blocker gate');

    const { data: gate2 } = await admin.rpc('decision_gate_status', {
      _application_id: s.applicationId,
    });
    assertEquals((gate2 as any).ready, true, 'gate status must report ready once blockers clear');

    const allowed = await handler(approveRequest(s));
    const allowedBody = await allowed.json().catch(() => ({}));
    assert(
      allowedBody.code !== 'DECISION_GATES_UNMET',
      `approval must not be gate-refused once gates pass (got ${allowed.status} ${JSON.stringify(allowedBody)})`,
    );
  },
});
