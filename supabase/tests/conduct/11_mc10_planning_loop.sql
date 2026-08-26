-- MC-10 CERTIFICATION — SUPERVISORY ATTENTION, PRIORITISATION, PLANNING,
-- INTERVENTION, OUTCOME, FOLLOW-UP AND REASSESSMENT.
-- Also certifies the market conduct approval permission resolution path:
-- the canonical identifier is public.sec_permissions(market_conduct.approve)
-- resolved through public.has_permission -> sec_has_permission ->
-- sec_user_permissions, and scoped by public.regulatory_scope_allows.
BEGIN;
SELECT plan(40);

-- ---------------- structure and lockdown ----------------
SELECT ok(
  (SELECT count(*) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_attention_items','conduct_attention_events',
                      'conduct_attention_priority_calcs','conduct_attention_reassessments',
                      'conduct_supervisory_plans','conduct_plan_events','conduct_plan_milestones',
                      'conduct_interventions','conduct_intervention_events',
                      'conduct_intervention_types')) = 10,
  'every MC-10 register is present');

SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_attention_items','conduct_supervisory_plans',
                      'conduct_interventions','conduct_intervention_types')),
  'row level security is enabled on the MC-10 registers');

SELECT ok(
  NOT has_table_privilege('authenticated','public.conduct_attention_items','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_attention_items','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_supervisory_plans','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_interventions','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_plan_events','INSERT')
  AND has_table_privilege('authenticated','public.conduct_attention_items','SELECT'),
  'MC-10 records can only be changed through governed operations, never from a browser session');

SELECT ok(
  NOT has_table_privilege('anon','public.conduct_attention_items','SELECT')
  AND NOT has_table_privilege('anon','public.conduct_supervisory_plans','SELECT')
  AND NOT has_table_privilege('anon','public.conduct_interventions','SELECT'),
  'anonymous users cannot read the MC-10 registers');

-- ---------------- canonical permission identifier ----------------
SELECT ok(
  (SELECT count(*) FROM public.sec_permissions p
     JOIN public.sec_modules m ON m.id = p.module_id
    WHERE m.key = 'market_conduct' AND p.key = 'approve'
      AND p.is_active AND m.is_active) = 1,
  'exactly one canonical market_conduct.approve permission exists');

SELECT ok(
  (SELECT count(*) FROM public.sec_permissions p
     JOIN public.sec_modules m ON m.id = p.module_id
    WHERE m.key = 'market_conduct' AND p.key IN ('approval','approve_plan','endorse')) = 0,
  'no duplicate or alias approval permissions were created for market conduct');

SELECT ok(
  (SELECT count(DISTINCT r.key) FROM public.sec_role_permissions rp
     JOIN public.sec_roles r ON r.id = rp.role_id
     JOIN public.sec_permissions p ON p.id = rp.permission_id
     JOIN public.sec_modules m ON m.id = p.module_id
    WHERE m.key = 'market_conduct' AND p.key = 'approve') = 1
  AND EXISTS (SELECT 1 FROM public.sec_role_permissions rp
     JOIN public.sec_roles r ON r.id = rp.role_id AND r.key = 'conduct_supervisor'
     JOIN public.sec_permissions p ON p.id = rp.permission_id
     JOIN public.sec_modules m ON m.id = p.module_id AND m.key = 'market_conduct'
    WHERE p.key = 'approve'),
  'market conduct approval authority is held by the Conduct Supervisor role only');

CREATE TEMP TABLE mc10 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _maker uuid; _checker uuid; _analyst uuid; _auditor uuid;
  _sector uuid; _entity uuid; _reg uuid; _other_sector uuid;
  _att uuid; _plan uuid; _iv uuid; _res jsonb; _row record;
  _snap jsonb; _cov jsonb; _links jsonb;
BEGIN
  SELECT id INTO _super   FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _maker   FROM public.profiles WHERE email = 'conduct_supervisor@mishainfotech.com';
  SELECT id INTO _checker FROM public.profiles WHERE email = 'complaints_supervisor@mishainfotech.com';
  SELECT id INTO _analyst FROM public.profiles WHERE email = 'conduct_analyst@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';

  SELECT l.sector_id, l.id, max(c.regulator_id) INTO _sector, _entity, _reg
    FROM public.complaints c JOIN public.licensees l ON l.id = c.licensee_id
   WHERE l.sector_id IS NOT NULL
   GROUP BY l.sector_id, l.id
   ORDER BY count(*) DESC LIMIT 1;

  -- A. permission resolution — positive and negative, straight from the resolver
  INSERT INTO mc10 VALUES ('resolver_matrix',
    public.has_permission(_maker,   'market_conduct','approve')
    AND public.has_permission(_checker, 'market_conduct','approve')
    AND public.has_permission(_super,  'market_conduct','approve')
    AND NOT public.has_permission(_analyst, 'market_conduct','approve')
    AND NOT public.has_permission(_auditor, 'market_conduct','approve')
    AND NOT public.has_permission(NULL,     'market_conduct','approve'),
    format('supervisor=%s analyst=%s auditor=%s',
      public.has_permission(_maker,'market_conduct','approve'),
      public.has_permission(_analyst,'market_conduct','approve'),
      public.has_permission(_auditor,'market_conduct','approve')));

  -- B. approval authority is scope bound, not global
  SELECT id INTO _other_sector FROM public.sectors
    WHERE id <> _sector
      AND NOT public.regulatory_scope_allows(_maker,'market_conduct','approve',NULL,id,NULL,NULL,_maker)
    LIMIT 1;
  INSERT INTO mc10 VALUES ('approval_is_scope_bound',
    public.regulatory_scope_allows(_maker,'market_conduct','approve',NULL,_sector,NULL,NULL,_maker)
    AND (_other_sector IS NULL
         OR NOT public.regulatory_scope_allows(_maker,'market_conduct','approve',NULL,_other_sector,NULL,NULL,_maker))
    AND NOT public.regulatory_scope_allows(_auditor,'market_conduct','approve',NULL,_sector,NULL,NULL,_auditor),
    format('in_scope_sector=%s out_of_scope_probe=%s', _sector, _other_sector));

  -- ============ the supervisory loop, acting as the maker ============
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);

  -- C. attention items demand a written supervisory basis
  BEGIN
    PERFORM public.conduct_attention_create('Fee disclosure concentration','complaint_pattern','conduct_patterns','too short',
      NULL,NULL,NULL,'fee_disclosure',ARRAY[_entity],_sector,_reg);
    INSERT INTO mc10 VALUES ('attention_basis_required', false, 'an attention item was accepted without a basis');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('attention_basis_required', SQLERRM LIKE 'A supervisory basis%', SQLERRM);
  END;

  -- D. attention is recorded with a reference and an open status
  _res := public.conduct_attention_create(
    'Fee disclosure concentration','complaint_pattern','conduct_patterns',
    'Repeat fee disclosure complaints across the sector require supervisory attention and a planned response.',
    NULL,NULL,NULL,'fee_disclosure',ARRAY[_entity],_sector,_reg,'high','urgent');
  _att := (_res->>'id')::uuid;
  INSERT INTO mc10 VALUES ('attention_recorded',
    _att IS NOT NULL AND (_res->>'reference') IS NOT NULL AND (_res->>'status') = 'OPEN',
    _res::text);

  -- E. the deterministic priority is reproducible and explains its factors
  DECLARE _p1 jsonb; _p2 jsonb;
  BEGIN
    _p1 := public.conduct_attention_priority_compute(_att, 180);
    _p2 := public.conduct_attention_priority_compute(_att, 180);
    INSERT INTO mc10 VALUES ('priority_deterministic',
      (_p1 - 'calculation_id' - 'calculated_at') = (_p2 - 'calculation_id' - 'calculated_at')
      AND (_p1->>'calculated_priority') IS NOT NULL AND _p1 ? 'factors',
      _p1::text);
  END;

  -- F. the calculated result is retained, and an override needs a written reason
  BEGIN
    PERFORM public.conduct_attention_priority_confirm(_att,
      CASE WHEN (SELECT calculated_priority FROM public.conduct_attention_items WHERE id=_att) = 'IMMEDIATE'
           THEN 'MONITOR' ELSE 'IMMEDIATE' END, 'too short');
    INSERT INTO mc10 VALUES ('override_rationale_required', false, 'an unexplained override was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('override_rationale_required', SQLERRM LIKE 'A written rationale%', SQLERRM);
  END;

  _res := public.conduct_attention_priority_confirm(_att,
    (SELECT calculated_priority FROM public.conduct_attention_items WHERE id=_att), NULL);
  SELECT calculated_priority, confirmed_priority, priority_overridden, status
    INTO _row FROM public.conduct_attention_items WHERE id = _att;
  INSERT INTO mc10 VALUES ('priority_confirmed_by_human',
    _row.confirmed_priority = _row.calculated_priority AND _row.priority_overridden = false
    AND _row.status = 'PRIORITISED'
    AND EXISTS (SELECT 1 FROM public.conduct_attention_events
                 WHERE attention_id=_att AND event_type='PRIORITY_CONFIRMED' AND actor_id=_maker),
    _row::text);

  -- G. a plan is created from the attention item and carries a human objective
  _res := public.conduct_plan_create(
    'Sector fee disclosure supervisory plan',
    'Confirmed high priority attention item with repeat fee disclosure complaints across the sector.',
    _att, NULL,
    'Establish whether fee disclosure practices meet conduct expectations and secure remediation where they do not.',
    'Sector-wide review of fee disclosure documentation and complaint handling.');
  _plan := (_res->>'id')::uuid;
  INSERT INTO mc10 VALUES ('plan_created_from_attention',
    _plan IS NOT NULL AND (_res->>'status') = 'DRAFT'
    AND (SELECT attention_id FROM public.conduct_supervisory_plans WHERE id=_plan) = _att,
    _res::text);

  -- H. interventions cannot be raised under an unapproved plan
  BEGIN
    PERFORM public.conduct_intervention_initiate('DESK_REVIEW','Premature desk review',
      'A desk review should not be possible before the supervisory plan has been approved.',
      _att, _plan);
    INSERT INTO mc10 VALUES ('plan_gate_before_intervention', false, 'an intervention was raised under a draft plan');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('plan_gate_before_intervention', SQLERRM LIKE 'transition_not_permitted%', SQLERRM);
  END;

  -- I. the plan is submitted, and the submitter cannot approve their own plan
  _res := public.conduct_plan_transition(_plan,'SUBMITTED','Submitted for supervisory approval.');
  INSERT INTO mc10 VALUES ('plan_submitted',
    (_res->>'to_status') = 'SUBMITTED'
    AND (SELECT submitted_by FROM public.conduct_supervisory_plans WHERE id=_plan) = _maker,
    _res::text);

  BEGIN
    PERFORM public.conduct_plan_transition(_plan,'APPROVED','Approving the plan I submitted myself.');
    INSERT INTO mc10 VALUES ('self_approval_denied', false, 'the submitter approved their own plan');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('self_approval_denied',
      SQLERRM LIKE '%cannot approve it%', SQLERRM);
  END;

  -- J. an officer without approval authority is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_analyst,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_plan_transition(_plan,'APPROVED','A conduct analyst attempts to approve the plan.');
    INSERT INTO mc10 VALUES ('officer_approval_denied', false, 'an officer without approval rights approved a plan');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('officer_approval_denied', SQLERRM LIKE 'not_authorized: market_conduct.approve%', SQLERRM);
  END;

  -- K. an auditor can read the record but cannot change it
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_auditor,'role','authenticated')::text, true);
  DECLARE _readable boolean; _blocked boolean := false;
  BEGIN
    _readable := EXISTS (SELECT 1 FROM public.conduct_supervisory_plans WHERE id=_plan);
    BEGIN
      PERFORM public.conduct_plan_transition(_plan,'APPROVED','An auditor attempts to approve the plan.');
    EXCEPTION WHEN OTHERS THEN _blocked := true;
    END;
    INSERT INTO mc10 VALUES ('auditor_read_only', _readable AND _blocked,
      format('readable=%s blocked=%s', _readable, _blocked));
  END;

  -- L. a second authorised Conduct Supervisor approves the plan
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_checker,'role','authenticated')::text, true);
  _res := public.conduct_plan_transition(_plan,'APPROVED',
    'Objective, scope and priority reviewed. Approved as a proportionate supervisory response.');
  SELECT status, approved_by, approval_rationale INTO _row
    FROM public.conduct_supervisory_plans WHERE id = _plan;
  INSERT INTO mc10 VALUES ('supervisor_approval_works',
    _row.status = 'APPROVED' AND _row.approved_by = _checker AND _row.approved_by <> _maker,
    _res::text);

  -- M. the approval is fully traceable
  INSERT INTO mc10 VALUES ('approval_traceable',
    EXISTS (SELECT 1 FROM public.conduct_plan_events e
             WHERE e.plan_id=_plan AND e.event_type='APPROVAL' AND e.from_status='SUBMITTED'
               AND e.to_status='APPROVED' AND e.actor_id=_checker
               AND length(COALESCE(e.rationale,'')) >= 10 AND e.created_at IS NOT NULL),
    (SELECT string_agg(event_type||':'||COALESCE(from_status,'-')||'>'||COALESCE(to_status,'-'), ', ' ORDER BY created_at)
       FROM public.conduct_plan_events WHERE plan_id=_plan));

  -- N. activation pulls the attention item into progress
  _res := public.conduct_plan_transition(_plan,'ACTIVE','Plan activated and supervisory work commenced.');
  INSERT INTO mc10 VALUES ('plan_activation_updates_attention',
    (SELECT status FROM public.conduct_supervisory_plans WHERE id=_plan) = 'ACTIVE'
    AND (SELECT status FROM public.conduct_attention_items WHERE id=_att) = 'IN_PROGRESS',
    _res::text);

  -- O. milestones are recorded against the plan
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  _res := public.conduct_plan_milestone_upsert(_plan,'Complete documentation review', (current_date + 30));
  INSERT INTO mc10 VALUES ('plan_milestones',
    EXISTS (SELECT 1 FROM public.conduct_plan_milestones WHERE plan_id=_plan), _res::text);

  -- P. only catalogue interventions may be raised
  BEGIN
    PERFORM public.conduct_intervention_initiate('FREEFORM_ACTION','Invented power',
      'An intervention type outside the approved catalogue must be refused by the server.', _att, _plan);
    INSERT INTO mc10 VALUES ('catalogue_constrained', false, 'a free-form intervention type was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('catalogue_constrained', SQLERRM LIKE 'unsupported_intervention_type%', SQLERRM);
  END;

  -- Q. an intervention is initiated under the active plan and inherits catalogue metadata
  _res := public.conduct_intervention_initiate('INFORMATION_REQUEST','Fee disclosure information request',
    'Documentation is required from the entity to establish whether fee disclosure meets conduct expectations.',
    _att, _plan, _entity);
  _iv := (_res->>'id')::uuid;
  INSERT INTO mc10 VALUES ('intervention_initiated',
    _iv IS NOT NULL AND (_res->>'status') = 'PROPOSED'
    AND (_res->>'catalogue_code') = 'INFORMATION_REQUEST'
    AND (SELECT canonical_module FROM public.conduct_interventions WHERE id=_iv) = 'correspondence_threads'
    AND (SELECT plan_id FROM public.conduct_interventions WHERE id=_iv) = _plan
    AND EXISTS (SELECT 1 FROM public.conduct_attention_events
                 WHERE attention_id=_att AND event_type='INTERVENTION_RAISED'),
    _res::text);

  -- R. the proposing officer cannot endorse their own intervention
  BEGIN
    PERFORM public.conduct_intervention_decide(_iv,'endorse','Endorsing the intervention I proposed myself.');
    INSERT INTO mc10 VALUES ('intervention_self_decision_denied', false, 'the proposer endorsed their own intervention');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('intervention_self_decision_denied',
      SQLERRM LIKE '%cannot decide their own intervention%', SQLERRM);
  END;

  -- S. an officer without approval authority cannot endorse
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_analyst,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_intervention_decide(_iv,'endorse','A conduct analyst attempts to endorse.');
    INSERT INTO mc10 VALUES ('intervention_endorsement_gated', false, 'an unauthorised officer endorsed an intervention');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('intervention_endorsement_gated',
      SQLERRM LIKE 'not_authorized: market_conduct.approve%', SQLERRM);
  END;

  -- T. an authorised Conduct Supervisor endorses the intervention
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_checker,'role','authenticated')::text, true);
  _res := public.conduct_intervention_decide(_iv,'endorse',
    'Proportionate to the recorded concern. Endorsed for issue under the active supervisory plan.');
  INSERT INTO mc10 VALUES ('intervention_endorsed_by_supervisor',
    (_res->>'status') = 'ENDORSED'
    AND (SELECT decided_by FROM public.conduct_interventions WHERE id=_iv) = _checker
    AND EXISTS (SELECT 1 FROM public.conduct_intervention_events
                 WHERE intervention_id=_iv AND event_type='DECISION' AND to_status='ENDORSED' AND actor_id=_checker),
    _res::text);

  -- U. canonical linkage is retained
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  _res := public.conduct_intervention_transition(_iv,'IN_PROGRESS','Information request issued to the entity.');
  DECLARE _thread uuid;
  BEGIN
    SELECT id INTO _thread FROM public.correspondence_threads ORDER BY created_at DESC LIMIT 1;
    IF _thread IS NOT NULL THEN
      _res := public.conduct_intervention_link_canonical(_iv,'correspondence_threads',_thread,'THREAD-LINK');
    END IF;
    INSERT INTO mc10 VALUES ('canonical_linkage',
      _thread IS NULL OR (SELECT canonical_record_id FROM public.conduct_interventions WHERE id=_iv) = _thread,
      COALESCE(_res::text,'no correspondence thread available'));
  END;

  -- V. an outcome requires a reasoned result and records follow-up
  BEGIN
    PERFORM public.conduct_intervention_record_outcome(_iv,'partially_effective','short');
    INSERT INTO mc10 VALUES ('outcome_rationale_required', false, 'an unexplained outcome was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc10 VALUES ('outcome_rationale_required', true, SQLERRM);
  END;

  _res := public.conduct_intervention_record_outcome(_iv,'partially_effective',
    'The entity supplied documentation showing partial remediation; disclosure templates remain outstanding.',
    'Fee tables corrected; pre-contract disclosure templates not yet updated.',
    'Updated disclosure templates to be filed.',
    '[]'::jsonb, (current_date + 45), 'Verify updated templates on filing.');
  INSERT INTO mc10 VALUES ('outcome_recorded',
    (SELECT outcome_result FROM public.conduct_interventions WHERE id=_iv) = 'partially_effective'
    AND (SELECT followup_due_date FROM public.conduct_interventions WHERE id=_iv) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.conduct_intervention_events
                 WHERE intervention_id=_iv AND event_type IN ('OUTCOME','OUTCOME_RECORDED')),
    _res::text);

  -- W. follow-up is tracked to completion
  _res := public.conduct_intervention_record_followup(_iv,'Updated disclosure templates received and reviewed.',
    NULL, true);
  INSERT INTO mc10 VALUES ('followup_tracked',
    (SELECT followup_completed FROM public.conduct_interventions WHERE id=_iv) = true,
    _res::text);

  -- X. reassessment closes the loop back onto the attention item
  _res := public.conduct_attention_reassess(_att,'reduced',
    'Remediation evidenced through the information request; residual concern is now low.',
    'monitor', _iv, (current_date + 90));
  INSERT INTO mc10 VALUES ('reassessment_closes_loop',
    EXISTS (SELECT 1 FROM public.conduct_attention_reassessments
             WHERE attention_id=_att AND intervention_id=_iv AND assessed_by=_maker),
    _res::text);

  -- Y. the attention item can be closed with a disposition
  _res := public.conduct_attention_transition(_att,'CLOSED',
    'Supervisory concern addressed through the completed intervention and verified follow-up.','remediated');
  INSERT INTO mc10 VALUES ('attention_closed',
    (SELECT status FROM public.conduct_attention_items WHERE id=_att) = 'CLOSED'
    AND EXISTS (SELECT 1 FROM public.conduct_attention_events
                 WHERE attention_id=_att AND to_state='CLOSED'),
    _res::text);

  -- Z. the planning fact package is deterministic and signed for freshness
  DECLARE _s1 jsonb; _s2 jsonb;
  BEGIN
    _s1 := public.conduct_planning_snapshot(_att, NULL);
    _s2 := public.conduct_planning_snapshot(_att, NULL);
    INSERT INTO mc10 VALUES ('planning_snapshot_deterministic',
      (_s1 - 'generated_at') = (_s2 - 'generated_at')
      AND (_s1 ? 'signature') AND (_s1->>'signature') = (_s2->>'signature'),
      left(_s1::text, 300));
  END;

  -- AA. management coverage reports the real gaps
  _cov := public.conduct_planning_coverage(_sector, NULL);
  INSERT INTO mc10 VALUES ('coverage_reports_gaps',
    _cov ? 'gaps' AND _cov ? 'overview', left(_cov::text, 300));

  -- AB. entity drill-through returns the planning trail for the entity
  _links := public.conduct_entity_planning_links(_entity);
  INSERT INTO mc10 VALUES ('entity_drill_through',
    _links ? 'attention' AND _links ? 'plans' AND _links ? 'interventions'
    AND jsonb_array_length(_links->'interventions') >= 1,
    left(_links::text, 300));

  -- AC. MC-10 AI use cases are registered in the MC-08 control plane
  INSERT INTO mc10 VALUES ('ai_use_cases_governed',
    (SELECT count(*) FROM public.conduct_ai_use_cases
      WHERE code IN ('ATTENTION_SUMMARY','PLANNING_RECORDS_REVIEW','PLANNING_QUESTIONS',
                     'INTERVENTION_OPTIONS','PLAN_DRAFT','FOLLOWUP_REVIEW')) >= 6,
    (SELECT string_agg(code, ', ' ORDER BY code) FROM public.conduct_ai_use_cases
      WHERE code LIKE '%PLAN%' OR code LIKE '%ATTENTION%' OR code LIKE '%INTERVENTION%' OR code LIKE '%FOLLOWUP%'));

  -- AD. anonymous callers cannot operate any MC-10 governed function
  PERFORM set_config('request.jwt.claims', NULL, true);
  DECLARE _a1 boolean := false; _a2 boolean := false; _a3 boolean := false;
  BEGIN
    BEGIN PERFORM public.conduct_attention_create('x','complaint_pattern','conduct_patterns',
      'anonymous attempt at creating a supervisory attention item',NULL,NULL,NULL,'fee_disclosure');
    EXCEPTION WHEN OTHERS THEN _a1 := true; END;
    BEGIN PERFORM public.conduct_plan_transition(_plan,'COMPLETED','anonymous attempt');
    EXCEPTION WHEN OTHERS THEN _a2 := true; END;
    BEGIN PERFORM public.conduct_intervention_decide(_iv,'reject','anonymous attempt');
    EXCEPTION WHEN OTHERS THEN _a3 := true; END;
    INSERT INTO mc10 VALUES ('anonymous_denied', _a1 AND _a2 AND _a3,
      format('%s/%s/%s', _a1, _a2, _a3));
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);
END $$;

SELECT ok(COALESCE(pass,false), 'market conduct approval authority resolves correctly for every persona'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'resolver_matrix';
SELECT ok(COALESCE(pass,false), 'approval authority is bound to the supervisor''s authorised scope'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'approval_is_scope_bound';
SELECT ok(COALESCE(pass,false), 'an attention item requires a written supervisory basis'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'attention_basis_required';
SELECT ok(COALESCE(pass,false), 'an attention item is recorded with a reference and an open status'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'attention_recorded';
SELECT ok(COALESCE(pass,false), 'the calculated priority is deterministic and shows its factors'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'priority_deterministic';
SELECT ok(COALESCE(pass,false), 'overriding the calculated priority requires a written reason'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'override_rationale_required';
SELECT ok(COALESCE(pass,false), 'a human confirms the priority and the calculation is retained'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'priority_confirmed_by_human';
SELECT ok(COALESCE(pass,false), 'a supervisory plan is created from the attention item'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'plan_created_from_attention';
SELECT ok(COALESCE(pass,false), 'interventions cannot be raised under an unapproved plan'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'plan_gate_before_intervention';
SELECT ok(COALESCE(pass,false), 'the plan is submitted and the submitter is recorded'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'plan_submitted';
SELECT ok(COALESCE(pass,false), 'the officer who submitted a plan cannot approve it'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'self_approval_denied';
SELECT ok(COALESCE(pass,false), 'an officer without approval authority cannot approve a plan'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'officer_approval_denied';
SELECT ok(COALESCE(pass,false), 'an auditor can read a plan but cannot approve it'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'a second authorised Conduct Supervisor can approve the plan'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'supervisor_approval_works';
SELECT ok(COALESCE(pass,false), 'the approval is traceable to actor, states, time and rationale'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'approval_traceable';
SELECT ok(COALESCE(pass,false), 'activating a plan moves the attention item into progress'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'plan_activation_updates_attention';
SELECT ok(COALESCE(pass,false), 'plan milestones are recorded'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'plan_milestones';
SELECT ok(COALESCE(pass,false), 'only approved catalogue interventions can be raised'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'catalogue_constrained';
SELECT ok(COALESCE(pass,false), 'an intervention is initiated under the active plan with catalogue metadata'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'intervention_initiated';
SELECT ok(COALESCE(pass,false), 'the proposing officer cannot decide their own intervention'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'intervention_self_decision_denied';
SELECT ok(COALESCE(pass,false), 'endorsing an intervention requires approval authority'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'intervention_endorsement_gated';
SELECT ok(COALESCE(pass,false), 'an authorised Conduct Supervisor can endorse the intervention'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'intervention_endorsed_by_supervisor';
SELECT ok(COALESCE(pass,false), 'canonical module linkage is retained on the intervention'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'canonical_linkage';
SELECT ok(COALESCE(pass,false), 'an intervention outcome requires a reasoned explanation'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'outcome_rationale_required';
SELECT ok(COALESCE(pass,false), 'the intervention outcome and follow-up requirement are recorded'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'outcome_recorded';
SELECT ok(COALESCE(pass,false), 'follow-up is tracked through to completion'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'followup_tracked';
SELECT ok(COALESCE(pass,false), 'reassessment links the outcome back to the attention item'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'reassessment_closes_loop';
SELECT ok(COALESCE(pass,false), 'the attention item is closed with a recorded disposition'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'attention_closed';
SELECT ok(COALESCE(pass,false), 'the planning fact package is deterministic and signed'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'planning_snapshot_deterministic';
SELECT ok(COALESCE(pass,false), 'planning coverage reports gaps and an overview'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'coverage_reports_gaps';
SELECT ok(COALESCE(pass,false), 'entity drill-through returns the planning trail'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'entity_drill_through';
SELECT ok(COALESCE(pass,false), 'MC-10 AI use cases are governed in the control plane'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'ai_use_cases_governed';
SELECT ok(COALESCE(pass,false), 'anonymous callers cannot operate MC-10 governed functions'
  || COALESCE(' :: ' || detail,'')) FROM mc10 WHERE name = 'anonymous_denied';

SELECT * FROM finish();
ROLLBACK;
