import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireUserPermission } from "../_shared/authz.ts";

interface Body {
  application_id: string;
  triggered_by?: 'manual' | 'submit' | 'workflow' | 'rfi_response' | 'system';
  generate_rfi?: boolean;
}

function pickPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __authzGate = await requireUserPermission(req, "application_management", "edit");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const svc = createClient(supabaseUrl, serviceKey);

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const userId = __authzGate.userId;

    const body = (await req.json()) as Body;
    if (!body?.application_id) {
      return new Response(JSON.stringify({ error: 'application_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load application
    const { data: app, error: appErr } = await svc.from('applications').select('*').eq('id', body.application_id).maybeSingle();
    if (appErr || !app) throw new Error(appErr?.message || 'application not found');

    // Resolve rule sets
    const { data: sets } = await svc
      .from('sufficiency_rule_sets')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    const matched = (sets || []).filter((s: any) => {
      if (s.application_type && s.application_type !== (app as any).application_type) return false;
      if (s.license_type && s.license_type !== (app as any).license_type) return false;
      if (s.sector_id && s.sector_id !== (app as any).sector_id) return false;
      if (s.sub_sector_id && s.sub_sector_id !== (app as any).sub_sector_id) return false;
      if (s.category_id && s.category_id !== (app as any).category_id) return false;
      return true;
    });
    const chosen = matched[0];

    let rules: any[] = [];
    if (chosen) {
      const { data: items } = await svc
        .from('sufficiency_rule_set_items')
        .select('*, rule:sufficiency_rules(*)')
        .eq('rule_set_id', chosen.id)
        .order('ordinal', { ascending: true });
      rules = (items || []).map((it: any) => ({ ...it.rule, severity: it.severity_override || it.rule.severity, _item_id: it.id }));
    }

    // Pre-load evidence pools once
    const [formsRes, docsRes, paymentsRes, aiRes, coordRes] = await Promise.all([
      // form_responses and documents are both keyed by (entity_type, entity_id);
      // neither carries an application_id column.
      svc.from('form_responses').select('*').eq('entity_type', 'application').eq('entity_id', body.application_id),
      svc.from('documents').select('*').eq('entity_type', 'application').eq('entity_id', body.application_id),
      svc.from('payments').select('*').eq('application_id', body.application_id),
      svc.from('application_ai_assessments').select('*').eq('application_id', body.application_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      svc.from('coordination_participants').select('*, case:coordination_cases!inner(*)').eq('case.subject_id', body.application_id),
    ]);

    const forms = formsRes.data || [];
    const docs = docsRes.data || [];
    const payments = paymentsRes.data || [];
    const ai = aiRes.data;
    const coordParticipants = coordRes.data || [];

    const results: any[] = [];
    let blockerCount = 0, warningCount = 0, passCount = 0;

    for (const rule of rules.filter((r) => r.is_active !== false)) {
      const cfg = rule.config || {};
      let status: 'pass' | 'fail' | 'warning' | 'na' = 'na';
      const detail: Record<string, unknown> = {};

      try {
        switch (rule.rule_type) {
          case 'form_submitted': {
            const f = forms.find((x: any) => x.form_template_id === cfg.form_template_id && (x.status === 'submitted' || x.status === 'completed'));
            status = f ? 'pass' : 'fail';
            detail.form_template_id = cfg.form_template_id;
            break;
          }
          case 'document_uploaded': {
            const found = docs.find((d: any) => (cfg.document_group_id ? d.document_group_id === cfg.document_group_id : true) && (cfg.document_type ? d.document_type === cfg.document_type : true));
            status = found ? 'pass' : 'fail';
            break;
          }
          case 'field_present': {
            const latest = forms.find((x: any) => x.form_template_id === cfg.form_template_id) || forms[0];
            const val = pickPath(latest?.data ?? {}, cfg.field_path || '');
            const has = val !== undefined && val !== null && val !== '';
            if (cfg.expected !== undefined) status = val === cfg.expected ? 'pass' : 'fail';
            else status = has ? 'pass' : 'fail';
            detail.value = val ?? null;
            break;
          }
          case 'fee_paid': {
            const paid = payments.filter((p: any) => p.status === 'verified' || p.status === 'completed').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
            const required = Number(cfg.min_amount ?? 0);
            status = paid >= required ? 'pass' : 'fail';
            detail.paid = paid; detail.required = required;
            break;
          }
          case 'declaration_answered': {
            const latest = forms.find((x: any) => x.form_template_id === cfg.form_template_id) || forms[0];
            const val = pickPath(latest?.data ?? {}, cfg.field_path || cfg.declaration_key || '');
            status = val === (cfg.expected ?? true) ? 'pass' : 'fail';
            detail.value = val ?? null;
            break;
          }
          case 'risk_flag_present': {
            const flagged = coordParticipants.some((p: any) => p.case?.priority === 'high' || p.case?.status === 'escalated');
            status = flagged ? 'fail' : 'pass';
            break;
          }
          case 'ai_flag_review': {
            const needs = ai && (ai as any).requires_review === true;
            status = needs ? 'fail' : 'pass';
            detail.ai_summary = (ai as any)?.summary ?? null;
            break;
          }
          case 'regulator_clearance': {
            const cleared = coordParticipants.find((p: any) => p.regulator_id === cfg.regulator_id && (p.status === 'cleared' || p.status === 'concurred'));
            status = cleared ? 'pass' : 'fail';
            break;
          }
        }
      } catch (e) {
        status = 'na';
        detail.error = (e as Error).message;
      }

      if (status === 'fail' && rule.severity === 'warning') { status = 'warning'; }
      if (status === 'fail') blockerCount++;
      else if (status === 'warning') warningCount++;
      else if (status === 'pass') passCount++;

      results.push({ rule, status, detail });
    }

    const overall = blockerCount > 0 ? 'insufficient' : warningCount > 0 ? 'warning' : 'sufficient';

    // Insert evaluation
    const { data: evalRow, error: evalErr } = await svc
      .from('sufficiency_evaluations')
      .insert({
        application_id: body.application_id,
        rule_set_id: chosen?.id ?? null,
        triggered_by: body.triggered_by || 'manual',
        evaluated_by: userId,
        overall_status: overall,
        blocker_count: blockerCount,
        warning_count: warningCount,
        pass_count: passCount,
        snapshot: { rule_set: chosen ? { id: chosen.id, name: chosen.name } : null, counts: { blockerCount, warningCount, passCount } },
      })
      .select()
      .single();
    if (evalErr) throw evalErr;

    // Insert results
    const resultRows = results.map((r) => ({
      evaluation_id: evalRow.id,
      rule_id: r.rule.id,
      rule_snapshot: { code: r.rule.code, name: r.rule.name, rule_type: r.rule.rule_type, config: r.rule.config, severity: r.rule.severity },
      severity: r.rule.severity,
      status: r.status,
      detail: r.detail,
    }));
    let insertedResults: any[] = [];
    if (resultRows.length) {
      const { data: ins } = await svc.from('sufficiency_evaluation_results').insert(resultRows).select();
      insertedResults = ins || [];
    }

    // Auto-generate RFI for failed rules with auto_rfi
    let rfiId: string | null = null;
    const wantRfi = body.generate_rfi !== false;
    const failedForRfi = results
      .map((r, i) => ({ r, inserted: insertedResults[i] }))
      .filter((x) => (x.r.status === 'fail' || x.r.status === 'warning') && x.r.rule.auto_rfi);

    if (wantRfi && failedForRfi.length) {
      const { data: rfi, error: rfiErr } = await svc.from('application_rfis').insert({
        application_id: body.application_id,
        raised_by: userId,
        status: 'open',
        summary: `Auto-generated from sufficiency evaluation (${failedForRfi.length} item${failedForRfi.length > 1 ? 's' : ''})`,
        sufficiency_evaluation_id: evalRow.id,
        pauses_sla: true,
      }).select().single();
      if (rfiErr) throw rfiErr;
      rfiId = rfi.id;

      const itemRows = failedForRfi.map((x, i) => ({
        rfi_id: rfi.id,
        ordinal: i + 1,
        prompt: (x.r.rule.rfi_prompt_template || x.r.rule.name || 'Please provide the required information.'),
        question_type: x.r.rule.rfi_question_type || 'text',
        required: true,
        response_status: 'pending',
      }));
      const { data: insItems } = await svc.from('application_rfi_items').insert(itemRows).select();

      // Link back
      if (insItems) {
        for (let i = 0; i < insItems.length; i++) {
          const resId = failedForRfi[i].inserted?.id;
          if (resId) {
            await svc.from('sufficiency_evaluation_results').update({ auto_rfi_item_id: insItems[i].id }).eq('id', resId);
          }
        }
      }
    }

    // Update application status pointer
    await svc.from('applications').update({
      sufficiency_status: overall,
      last_sufficiency_evaluation_id: evalRow.id,
    }).eq('id', body.application_id);

    // Audit
    await svc.from('audit_logs').insert({
      user_id: userId,
      action: 'application.sufficiency.evaluated',
      entity_type: 'application',
      entity_id: body.application_id,
      new_value: { evaluation_id: evalRow.id, overall, blockerCount, warningCount, passCount },
      metadata: { triggered_by: body.triggered_by || 'manual', rfi_id: rfiId },
    });

    return new Response(JSON.stringify({
      evaluation_id: evalRow.id,
      overall_status: overall,
      blocker_count: blockerCount,
      warning_count: warningCount,
      pass_count: passCount,
      generated_rfi_id: rfiId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[sufficiency] error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
