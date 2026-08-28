import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from "../_shared/authz.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

// Daily scheduled sweep. Also invokable manually by admins.
// For every current fp_individual_role with a reassessment_cycle_months and
// next_reassessment_due <= today (or null if never reassessed), open a new
// cycle-type fp_assessment and mark the role's last_reassessment_at/next_due.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });


  const __authzGate = await requireUserPermission(req, "fit_and_proper", "execute");
  if (!__authzGate.ok) return __authzGate.response;
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const { data: roles, error } = await supa
      .from('fp_individual_roles')
      .select('id, individual_id, licensee_id, role_type, reassessment_cycle_months, next_reassessment_due, last_reassessment_at')
      .eq('is_current', true)
      .not('reassessment_cycle_months', 'is', null);
    if (error) throw new Error(error.message);

    const due = (roles ?? []).filter((r: Any) =>
      !r.next_reassessment_due || r.next_reassessment_due <= todayStr
    );

    let opened = 0;
    const errors: string[] = [];

    for (const r of due) {
      try {
        // Skip if there is already an open cycle assessment for this individual+role
        const { data: existing } = await supa
          .from('fp_assessments')
          .select('id')
          .eq('individual_id', r.individual_id)
          .eq('role_id', r.id)
          .eq('assessment_type', 'cycle')
          .in('status', ['draft', 'submitted', 'screening', 'under_review'])
          .limit(1)
          .maybeSingle();
        if (existing) continue;

        const { data: created, error: aErr } = await supa
          .from('fp_assessments')
          .insert({
            individual_id: r.individual_id,
            licensee_id: r.licensee_id ?? null,
            role_id: r.id,
            assessment_type: 'cycle',
            status: 'draft',
            declaration_data: {},
          })
          .select('id')
          .single();
        if (aErr) throw aErr;

        const cycleMonths = r.reassessment_cycle_months;
        const next = new Date(today);
        next.setMonth(next.getMonth() + cycleMonths);
        const nextStr = next.toISOString().slice(0, 10);

        await supa
          .from('fp_individual_roles')
          .update({
            last_reassessment_at: today.toISOString(),
            next_reassessment_due: nextStr,
          })
          .eq('id', r.id);

        await supa.from('audit_logs').insert({
          entity_type: 'fp_assessment',
          entity_id: created.id,
          action: 'fp.assessment.cycle.opened',
          new_value: { role_id: r.id, individual_id: r.individual_id, cycle_months: cycleMonths },
          metadata: { module: 'fit_and_proper' },
        });

        // Fire a notification so assessors know a cycle-triggered assessment was opened.
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-notification-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
            body: JSON.stringify({
              event_key: 'fp_cycle_assessment_opened',
              entity_type: 'fp_assessment',
              entity_id: created.id,
              payload: { individual_id: r.individual_id, role_id: r.id, cycle_months: cycleMonths },
            }),
          });
        } catch (e) { console.warn('[fp-cycle-scheduler] notify failed', e); }

        opened++;
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e));
      }
    }

    return new Response(JSON.stringify({ ok: true, evaluated: (roles ?? []).length, due: due.length, opened, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fp-cycle-scheduler]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
