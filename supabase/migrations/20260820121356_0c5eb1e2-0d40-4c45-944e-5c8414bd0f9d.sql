CREATE OR REPLACE FUNCTION public.cert_seed_wave_d_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  idx int;
  uploader uuid;
  reg uuid;
  ent uuid;
  k text;
  authorised boolean;
  base date := date '2024-01-15';
  n_assign int := 0; n_risk int := 0; n_score int := 0; n_plan int := 0;
  n_prud int := 0; n_conduct int := 0; n_aml int := 0; n_amlf int := 0;
  n_res int := 0; n_inc int := 0; n_exam int := 0; n_examf int := 0;
  n_enf int := 0; n_corr int := 0; n_doc int := 0;
  arr_id uuid; exam_id uuid; aml_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'cert_seed_wave_d_v1 requires super admin';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cert_dataset_v1_reset_or_seed'));

  SELECT id INTO uploader FROM public.profiles ORDER BY id LIMIT 1;
  SELECT id INTO reg FROM public.regulators ORDER BY id LIMIT 1;

  FOR m IN
    SELECT sm.scenario_key, sm.display_name, sm.entity_id,
           row_number() OVER (ORDER BY sm.scenario_key) AS rn
    FROM public.certification_seed_manifest sm
    JOIN public.licensees l ON l.id = sm.entity_id
    WHERE sm.record_kind = 'REGULATED_ENTITY'
    ORDER BY sm.scenario_key
  LOOP
    ent := m.entity_id;
    k := m.scenario_key;
    idx := m.rn::int;
    -- E18 and E20 are applicant-stage entities: no post-authorisation activity.
    authorised := k NOT IN ('E18','E20');

    ---------------------------------------------------------------- supervision
    IF authorised THEN
      INSERT INTO public.entity_supervision_assignments
        (id, entity_id, supervisor_name, team, supervisory_cycle, cycle_start, cycle_end,
         status, effective_from, notes)
      VALUES (public.cert_uuid('WD:SUP:'||k), ent,
        'Supervisor ' || lpad(((idx % 6) + 1)::text, 2, '0'),
        (ARRAY['Banking Supervision','Insurance Supervision','Payments Supervision',
               'Securities Supervision','Fiduciary Supervision'])[((idx - 1) % 5) + 1],
        '2025 Annual Cycle', date '2025-01-01', date '2025-12-31',
        'active', (base + (idx * 3))::timestamptz,
        'Certification dataset v1 supervisory assignment for ' || k)
      ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
      n_assign := n_assign + 1;

      -- Two historical (superseded) assignments preserve supervision history.
      IF k IN ('E01','E06') THEN
        INSERT INTO public.entity_supervision_assignments
          (id, entity_id, supervisor_name, team, supervisory_cycle, cycle_start, cycle_end,
           status, effective_from, effective_to, notes)
        VALUES (public.cert_uuid('WD:SUP:HIST:'||k), ent,
          'Supervisor 09', 'Banking Supervision', '2024 Annual Cycle',
          date '2024-01-01', date '2024-12-31', 'ended',
          timestamptz '2024-01-01', timestamptz '2024-12-31',
          'Prior supervisory cycle retained for as-of certification')
        ON CONFLICT (id) DO NOTHING;
        n_assign := n_assign + 1;
      END IF;
    END IF;

    ------------------------------------------------------------ risk (15 entities)
    IF authorised AND idx <= 16 THEN
      INSERT INTO public.risk_ratings
        (id, entity_id, overall_rating, risk_score, assessment_date, risk_factors, notes)
      VALUES (public.cert_uuid('WD:RISK:'||k), ent,
        (ARRAY['low','medium','high','medium'])[((idx - 1) % 4) + 1],
        round(35 + ((idx * 7) % 55)::numeric, 2), base + (idx * 5),
        jsonb_build_object('capital', 2 + (idx % 3), 'conduct', 1 + (idx % 4),
                           'aml', 2 + (idx % 3), 'resilience', 1 + (idx % 3)),
        'Certification risk assessment for ' || k)
      ON CONFLICT (id) DO UPDATE SET risk_score = EXCLUDED.risk_score, updated_at = now();
      n_risk := n_risk + 1;

      -- Historical rating retained: risk state is never overwritten.
      INSERT INTO public.risk_ratings
        (id, entity_id, overall_rating, risk_score, assessment_date, risk_factors, notes)
      VALUES (public.cert_uuid('WD:RISK:PRIOR:'||k), ent,
        (ARRAY['low','low','medium','high'])[((idx - 1) % 4) + 1],
        round(30 + ((idx * 5) % 40)::numeric, 2), (base - 365) + (idx * 5),
        jsonb_build_object('capital', 2, 'conduct', 1, 'aml', 2, 'resilience', 1),
        'Prior-year certification risk assessment for ' || k)
      ON CONFLICT (id) DO NOTHING;
      n_risk := n_risk + 1;

      INSERT INTO public.entity_risk_scores
        (id, entity_id, period_key, score, band, components, weights, computed_at, is_current)
      VALUES (public.cert_uuid('WD:SCORE:'||k), ent, '2025-Q2',
        round(35 + ((idx * 7) % 55)::numeric, 2),
        (ARRAY['low','medium','high','medium'])[((idx - 1) % 4) + 1],
        jsonb_build_object('prudential', 40, 'conduct', 20, 'aml', 25, 'resilience', 15),
        jsonb_build_object('prudential', 0.4, 'conduct', 0.2, 'aml', 0.25, 'resilience', 0.15),
        timestamptz '2025-07-05', true)
      ON CONFLICT (id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
      n_score := n_score + 1;
    END IF;

    ------------------------------------------------ supervisory plans (10 entities)
    IF authorised AND idx <= 11 THEN
      INSERT INTO public.supervisory_plans
        (id, entity_id, created_from, status, approval_status, notes, approved_at)
      VALUES (public.cert_uuid('WD:PLAN:'||k), ent, 'risk_assessment', 'active',
        CASE WHEN idx % 3 = 0 THEN 'pending_review' ELSE 'approved' END,
        'Certification supervisory plan for ' || k,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-02-10' END)
      ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
      n_plan := n_plan + 1;
    END IF;

    ------------------------------------------- prudential monitoring (8 entities)
    IF authorised AND idx <= 9 THEN
      INSERT INTO public.prudential_assessments
        (id, entity_id, period_start, period_end, overall_rating, ratings, rationale,
         conclusion, status, approved_at)
      VALUES (public.cert_uuid('WD:PRUD:'||k), ent, date '2025-01-01', date '2025-03-31',
        (ARRAY['satisfactory','fair','needs_improvement'])[((idx - 1) % 3) + 1],
        jsonb_build_object('capital', 2, 'asset_quality', 2, 'earnings', 3, 'liquidity', 2),
        'Quarterly prudential review based on accepted return filings.',
        'Capital and liquidity remain within configured thresholds.',
        CASE WHEN idx % 4 = 0 THEN 'reviewed' ELSE 'approved' END,
        CASE WHEN idx % 4 = 0 THEN NULL ELSE timestamptz '2025-05-15' END)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_prud := n_prud + 1;
    END IF;

    ------------------------------------------------ market conduct (6 entities)
    IF authorised AND idx <= 7 THEN
      INSERT INTO public.complaints
        (id, entity_id_placeholder_unused, subject, description)
      SELECT NULL, NULL, NULL, NULL WHERE false; -- placeholder guard, never executes

      INSERT INTO public.complaints
        (id, complaint_number, subject, description, status, severity, priority,
         licensee_id, regulator_id, customer_type, sla_days, created_at, email)
      VALUES (public.cert_uuid('WD:CONDUCT:'||k),
        'CERT-CMP-' || k, 'Fee disclosure concern raised against ' || m.display_name,
        'Certification dataset v1 market conduct scenario for ' || k ||
        ': customer alleges unclear disclosure of applicable fees.',
        CASE WHEN idx % 3 = 0 THEN 'resolved' ELSE 'under_investigation' END,
        (ARRAY['low','medium','high'])[((idx - 1) % 3) + 1],
        (ARRAY['p2','p3','p3'])[((idx - 1) % 3) + 1],
        ent, reg, 'retail', 20, timestamptz '2025-03-01' + (idx || ' days')::interval,
        lower(replace(replace(m.display_name,' ',''),'&','')) || '@mishainfotech.com')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_conduct := n_conduct + 1;
    END IF;

    ---------------------------------------------------- AML/CFT (6 entities)
    IF authorised AND idx <= 7 THEN
      aml_id := public.cert_uuid('WD:AML:'||k);
      INSERT INTO public.aml_assessments
        (id, entity_id, reference, assessment_date, inherent_rating, control_rating,
         residual_rating, status, summary, confidential_notes, inspection_status,
         next_review_date, approved_at)
      VALUES (aml_id, ent, 'CERT-AML-' || k, date '2025-04-10',
        (ARRAY['high','medium','high'])[((idx - 1) % 3) + 1],
        (ARRAY['adequate','partially_effective','effective'])[((idx - 1) % 3) + 1],
        (ARRAY['medium','high','medium'])[((idx - 1) % 3) + 1],
        CASE WHEN idx % 3 = 0 THEN 'in_review' ELSE 'approved' END,
        'AML/CFT risk assessment carried out under the certification dataset.',
        'Confidential supervisory judgement for ' || k || ' — restricted access.',
        CASE WHEN idx % 2 = 0 THEN 'completed' ELSE 'scheduled' END,
        date '2026-04-10',
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-05-02' END)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_aml := n_aml + 1;

      INSERT INTO public.aml_findings
        (id, aml_assessment_id, entity_id, reference, severity, title, detail,
         status, remediation_due, remediation_status)
      VALUES (public.cert_uuid('WD:AMLF:'||k), aml_id, ent, 'CERT-AMLF-' || k,
        (ARRAY['high','medium'])[((idx - 1) % 2) + 1],
        'Customer due diligence refresh overdue',
        'Periodic CDD refresh for higher-risk relationships was not completed within policy.',
        CASE WHEN idx % 4 = 0 THEN 'closed' ELSE 'open' END,
        date '2025-09-30',
        CASE WHEN idx % 4 = 0 THEN 'completed' ELSE 'in_progress' END)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_amlf := n_amlf + 1;
    END IF;

    ------------------------------------------ operational resilience (5 entities)
    IF authorised AND idx <= 6 THEN
      arr_id := public.cert_uuid('WD:RESA:'||k);
      INSERT INTO public.resilience_arrangements
        (id, entity_id, arrangement_type, provider_party_id, provider_name,
         service_description, criticality, status, effective_from, last_assessed_at,
         assessment_state)
      VALUES (arr_id, ent, 'material_outsourcing',
        (SELECT sm.organization_party_id FROM public.certification_seed_manifest sm
          WHERE sm.scenario_key = 'H5' LIMIT 1),
        'Regional Technology Services Ltd',
        'Core banking platform hosting and disaster recovery',
        CASE WHEN idx % 2 = 0 THEN 'critical' ELSE 'important' END,
        'active', date '2024-06-01', timestamptz '2025-02-20', 'assessed')
      ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
      n_res := n_res + 1;

      INSERT INTO public.resilience_incidents
        (id, entity_id, reference, incident_type, severity, occurred_at, reported_at,
         resolved_at, status, summary, remediation_status, arrangement_id)
      VALUES (public.cert_uuid('WD:RESI:'||k), ent, 'CERT-RES-' || k,
        'service_disruption',
        (ARRAY['high','medium','critical'])[((idx - 1) % 3) + 1],
        timestamptz '2025-05-12 09:00+00', timestamptz '2025-05-12 11:30+00',
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-05-13 18:00+00' END,
        CASE WHEN idx % 3 = 0 THEN 'open' ELSE 'closed' END,
        'Payment channel unavailable for four hours following provider outage.',
        CASE WHEN idx % 3 = 0 THEN 'in_progress' ELSE 'completed' END,
        arr_id)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_inc := n_inc + 1;
    END IF;

    -------------------------------------------------- examinations (8 entities)
    IF authorised AND idx <= 9 THEN
      exam_id := public.cert_uuid('WD:EXAM:'||k);
      INSERT INTO public.examinations
        (id, reference, entity_id, regulator_id, title, examination_type, stage,
         risk_rating, period_under_review_start, period_under_review_end,
         fieldwork_start, fieldwork_end, overall_conclusion, closed_at)
      VALUES (exam_id, 'CERT-EXAM-' || k, ent, reg,
        'Targeted examination — ' || m.display_name,
        CASE WHEN idx % 2 = 0 THEN 'targeted' ELSE 'full_scope' END,
        CASE WHEN idx % 3 = 0 THEN 'fieldwork' ELSE 'closed' END,
        (ARRAY['medium','high','low'])[((idx - 1) % 3) + 1],
        date '2024-07-01', date '2025-06-30', date '2025-07-14', date '2025-07-25',
        CASE WHEN idx % 3 = 0 THEN NULL ELSE 'Control environment broadly adequate with findings raised.' END,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-08-20' END)
      ON CONFLICT (id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = now();
      n_exam := n_exam + 1;

      INSERT INTO public.examination_findings
        (id, examination_id, reference, title, category, severity, observation,
         recommendation, status, target_date)
      VALUES (public.cert_uuid('WD:EXAMF:'||k), exam_id, 'CERT-EXF-' || k,
        'Board reporting pack lacks liquidity stress commentary',
        'governance', (ARRAY['medium','high'])[((idx - 1) % 2) + 1],
        'Liquidity stress results were not consistently reported to the Board.',
        'Expand the Board reporting pack to include stress testing outcomes.',
        CASE WHEN idx % 4 = 0 THEN 'closed' ELSE 'open' END,
        date '2025-11-30')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_examf := n_examf + 1;
    END IF;

    ---------------------------------------------------- enforcement (5 entities)
    IF authorised AND idx <= 6 THEN
      INSERT INTO public.enforcement_actions
        (id, entity_id, case_number, enforcement_type, date_opened, status,
         penalty_amount, penalty_currency, description, findings, review_state,
         decision_outcome, decision_at, effective_date, closed_at)
      VALUES (public.cert_uuid('WD:ENF:'||k), ent, 'CERT-ENF-' || k,
        (ARRAY['warning','directive','penalty'])[((idx - 1) % 3) + 1],
        date '2025-06-05', CASE WHEN idx % 3 = 0 THEN 'open' ELSE 'closed' END,
        CASE WHEN idx % 3 = 2 THEN 25000 ELSE 0 END, 'XCD',
        'Enforcement scenario arising from repeated late regulatory filings.',
        'Filing obligations were missed for two consecutive reporting periods.',
        CASE WHEN idx % 3 = 0 THEN 'under_review' ELSE 'approved' END,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE 'sanction_imposed' END,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-07-01' END,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE date '2025-07-15' END,
        CASE WHEN idx % 3 = 0 THEN NULL ELSE timestamptz '2025-08-01' END)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_enf := n_enf + 1;
    END IF;

    ------------------------------------------------------------- correspondence
    IF authorised THEN
      INSERT INTO public.correspondence_threads
        (id, reference, subject, summary, category, channel, direction, priority,
         status, sender_name, sender_org, sender_email, licensee_id, regulator_id,
         received_at, sla_days, thread_type, thread_state, last_message_at)
      VALUES (public.cert_uuid('WD:CORR:IN:'||k), 'CERT-COR-IN-' || k,
        'Request for clarification on quarterly return', 'Entity queried a validation rule.',
        'Returns', 'email', 'inbound', 'normal',
        CASE WHEN idx % 2 = 0 THEN 'closed' ELSE 'in_review' END,
        'Compliance Officer', m.display_name,
        lower(replace(replace(m.display_name,' ',''),'&','')) || '@mishainfotech.com',
        ent, reg, timestamptz '2025-04-02' + (idx || ' days')::interval, 5,
        'general_correspondence',
        CASE WHEN idx % 2 = 0 THEN 'closed' ELSE 'open' END,
        timestamptz '2025-04-05' + (idx || ' days')::interval)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_corr := n_corr + 1;

      INSERT INTO public.correspondence_threads
        (id, reference, subject, summary, category, channel, direction, priority,
         status, sender_name, sender_org, sender_email, licensee_id, regulator_id,
         received_at, sla_days, thread_type, thread_state, last_message_at)
      VALUES (public.cert_uuid('WD:CORR:OUT:'||k), 'CERT-COR-OUT-' || k,
        'Supervisory feedback letter', 'Regulator issued supervisory feedback.',
        'Supervision', 'letter', 'outbound', 'high', 'responded',
        'Supervision Unit', 'Regulator', NULL,
        ent, reg, timestamptz '2025-06-11' + (idx || ' days')::interval, 10,
        'general_correspondence', 'closed',
        timestamptz '2025-06-13' + (idx || ' days')::interval)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
      n_corr := n_corr + 1;
    END IF;

    ------------------------------------------------------------------ documents
    IF uploader IS NOT NULL THEN
      INSERT INTO public.documents (id, file_name, file_path, file_size, mime_type,
        uploaded_by, entity_type, entity_id)
      VALUES (public.cert_uuid('WD:DOC:1:'||k),
        'cert-' || lower(k) || '-supervisory-letter.pdf',
        'certification/' || lower(k) || '/supervisory-letter.pdf',
        184320, 'application/pdf', uploader, 'licensee', ent)
      ON CONFLICT (id) DO NOTHING;
      n_doc := n_doc + 1;

      INSERT INTO public.documents (id, file_name, file_path, file_size, mime_type,
        uploaded_by, entity_type, entity_id)
      VALUES (public.cert_uuid('WD:DOC:2:'||k),
        'cert-' || lower(k) || '-governance-pack.pdf',
        'certification/' || lower(k) || '/governance-pack.pdf',
        262144, 'application/pdf', uploader, 'licensee', ent)
      ON CONFLICT (id) DO NOTHING;
      n_doc := n_doc + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dataset','CERTIFICATION_DATASET_V1','wave','D',
    'supervision_assignments', n_assign, 'risk_assessments', n_risk,
    'risk_scores', n_score, 'supervisory_plans', n_plan,
    'prudential_assessments', n_prud, 'market_conduct_cases', n_conduct,
    'aml_assessments', n_aml, 'aml_findings', n_amlf,
    'resilience_arrangements', n_res, 'resilience_incidents', n_inc,
    'examinations', n_exam, 'examination_findings', n_examf,
    'enforcement_cases', n_enf, 'correspondence_threads', n_corr,
    'documents', n_doc);
END;
$function$;

REVOKE ALL ON FUNCTION public.cert_seed_wave_d_v1() FROM PUBLIC, anon, authenticated;