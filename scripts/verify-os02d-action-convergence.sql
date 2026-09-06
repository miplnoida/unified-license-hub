-- ACT-01…14 — OS-02D monitoring-to-action convergence certification gate
--
-- Contract under test (all SECURITY DEFINER, permission + scope gated):
--   public.supervisory_monitoring_action_capabilities(uuid, text)
--   public.supervisory_monitoring_provenance(uuid, text)
--   public.supervisory_monitoring_raise_attention(...)
--   public.supervisory_monitoring_require_reassessment(...)
--
-- Proves: write paths reach the canonical supervisory objects, repeated
-- observation de-duplicates, provenance is canonical and cannot be foreign,
-- authority is separated from monitoring, and the authoritative risk rating is
-- never changed by a monitoring action.
--
-- Run: psql "$DATABASE_URL" -f scripts/verify-os02d-action-convergence.sql
-- Everything runs in ONE transaction that always ROLLBACKs.

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE TEMP TABLE act_result(gate text PRIMARY KEY, title text, status text, detail text);

CREATE OR REPLACE FUNCTION pg_temp.rec(_gate text, _title text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO act_result VALUES (_gate, _title, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail)
  ON CONFLICT (gate) DO UPDATE SET status = excluded.status, detail = excluded.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('role', 'none', true); END $$;

-- ------------------------------------------------------------------ fixtures
-- A live actor that already holds the canonical command permissions AND
-- supervisory scope over an entity with an approved current assessment.
CREATE TEMP TABLE act_actor(uid uuid, entity_id uuid, domain_code text,
                            foreign_entity uuid, assessment_id uuid);

DO $$
DECLARE _uid uuid; _ent uuid; _dom text; _foreign uuid; _asmt uuid;
BEGIN
  SELECT p.id, a.entity_id, a.domain_code, a.id
    INTO _uid, _ent, _dom, _asmt
    FROM public.profiles p
    JOIN public.supervisory_assessment a
      ON upper(COALESCE(a.status,'')) = 'APPROVED' AND a.is_current AND a.approved_at IS NOT NULL
   WHERE public.has_any_permission(p.id, ARRAY['supervisory_spine.create','aml_supervision.create',
             'aml_supervision.approve'])
     AND public.has_any_permission(p.id, ARRAY['aml_supervision.review','aml_supervision.approve',
             'supervisory_spine.edit'])
     AND public.supervisory_entity_scope_permits(p.id, a.entity_id)
   ORDER BY a.approved_at DESC, p.id
   LIMIT 1;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'act_fixture_unavailable: no permitted actor with an approved assessment in scope';
  END IF;

  SELECT l.id INTO _foreign FROM public.licensees l WHERE l.id <> _ent
   ORDER BY l.created_at DESC LIMIT 1;

  INSERT INTO act_actor VALUES (_uid, _ent, _dom, _foreign, _asmt);
END $$;

CREATE TEMP TABLE act_baseline AS
SELECT (SELECT count(*) FROM public.supervisory_attention)                 AS attention,
       (SELECT count(*) FROM public.supervisory_attention_event)           AS attention_events,
       (SELECT count(*) FROM public.supervisory_reassessment_requirement)  AS reassessments,
       (SELECT count(*) FROM public.supervisory_signal)                    AS signals,
       (SELECT count(*) FROM public.entity_risk_state)                     AS risk_states,
       (SELECT count(*) FROM public.supervisory_finding)                   AS findings,
       (SELECT count(*) FROM public.supervisory_remediation_action)        AS remediation,
       (SELECT count(*) FROM public.examinations)                          AS examinations,
       (SELECT md5(COALESCE(string_agg(rs.entity_id::text || rs.domain_code
              || COALESCE(rs.residual_rating,'-') || COALESCE(rs.driving_assessment_id::text,'-'),
              ',' ORDER BY rs.entity_id, rs.domain_code), ''))
          FROM public.entity_risk_state rs)                                AS risk_fingerprint;

GRANT SELECT ON act_result, act_actor, act_baseline TO authenticated;

-- ===========================================================================
-- ACT-01 — anonymous caller denied on every OS-02D surface
-- ===========================================================================
DO $$
DECLARE a record; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO a FROM act_actor;
  PERFORM pg_temp.act_as_anon();
  BEGIN PERFORM public.supervisory_monitoring_action_capabilities(a.entity_id, a.domain_code);
    ok := false; msg := msg || 'capabilities answered anon; ';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'capabilities refused; '; END;
  BEGIN PERFORM public.supervisory_monitoring_provenance(a.entity_id, a.domain_code);
    ok := false; msg := msg || 'provenance answered anon; ';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'provenance refused; '; END;
  BEGIN PERFORM public.supervisory_monitoring_raise_attention(a.entity_id, a.domain_code,
      'anonymous attempt at raising supervisory attention');
    ok := false; msg := msg || 'raise_attention answered anon; ';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'raise_attention refused; '; END;
  BEGIN PERFORM public.supervisory_monitoring_require_reassessment(a.entity_id, a.domain_code,
      'anonymous attempt at requiring a reassessment');
    ok := false; msg := msg || 'require_reassessment answered anon';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'require_reassessment refused'; END;
  PERFORM pg_temp.act_as_owner();
  PERFORM pg_temp.rec('ACT-01','anonymous denied on all action surfaces', ok, msg);
END $$;

-- ===========================================================================
-- ACT-02 — the capabilities/provenance read is write-free
-- ===========================================================================
DO $$
DECLARE a record; b record; ok boolean;
BEGIN
  SELECT * INTO a FROM act_actor; SELECT * INTO b FROM act_baseline;
  PERFORM pg_temp.act_as(a.uid);
  PERFORM public.supervisory_monitoring_action_capabilities(a.entity_id, a.domain_code);
  PERFORM public.supervisory_monitoring_provenance(a.entity_id, a.domain_code);
  PERFORM pg_temp.act_as_owner();
  ok := (SELECT count(*) FROM public.supervisory_attention) = b.attention
    AND (SELECT count(*) FROM public.supervisory_attention_event) = b.attention_events
    AND (SELECT count(*) FROM public.supervisory_reassessment_requirement) = b.reassessments
    AND (SELECT count(*) FROM public.supervisory_signal) = b.signals
    AND (SELECT count(*) FROM public.entity_risk_state) = b.risk_states;
  PERFORM pg_temp.rec('ACT-02','capabilities/provenance read is write-free', ok,
    'no supervisory row count changed while reading next steps and provenance');
END $$;

-- ===========================================================================
-- ACT-03 — provenance is canonical: every item names a real record
-- ===========================================================================
DO $$
DECLARE a record; pv jsonb; n int; bad int; ok boolean;
BEGIN
  SELECT * INTO a FROM act_actor;
  PERFORM pg_temp.act_as(a.uid);
  pv := public.supervisory_monitoring_provenance(a.entity_id, a.domain_code);
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO n FROM jsonb_array_elements(COALESCE(pv->'items','[]'::jsonb));
  SELECT count(*) INTO bad FROM jsonb_array_elements(COALESCE(pv->'items','[]'::jsonb)) i
   WHERE COALESCE(i->>'source_table','') = '' OR COALESCE(i->>'source_id','') = '';
  ok := n > 0 AND bad = 0;
  PERFORM pg_temp.rec('ACT-03','provenance names canonical records', ok,
    n || ' provenance items, ' || bad || ' without a source table/id');
END $$;

-- ===========================================================================
-- ACT-04 — raise attention writes to the canonical supervisory attention object
-- ===========================================================================
CREATE TEMP TABLE act_state(attention_id uuid, requirement_id uuid);

DO $$
DECLARE a record; r jsonb; ok boolean; t record;
BEGIN
  SELECT * INTO a FROM act_actor;
  PERFORM pg_temp.act_as(a.uid);
  r := public.supervisory_monitoring_raise_attention(a.entity_id, a.domain_code,
        'OS-02D gate: material deterioration observed in continuous monitoring (rolled back)');
  PERFORM pg_temp.act_as_owner();
  INSERT INTO act_state(attention_id) VALUES ((r->>'attention_id')::uuid);
  SELECT * INTO t FROM public.supervisory_attention WHERE id = (r->>'attention_id')::uuid;
  ok := t.id IS NOT NULL AND t.closed_at IS NULL
    AND a.entity_id = ANY (COALESCE(t.entity_ids, ARRAY[]::uuid[]))
    AND COALESCE(t.domain_code,'') = a.domain_code
    AND EXISTS (SELECT 1 FROM public.supervisory_attention_origin o WHERE o.attention_id = t.id);
  PERFORM pg_temp.rec('ACT-04','attention written to canonical object', ok,
    'attention ' || COALESCE(t.reference,'?') || ' created=' || COALESCE(r->>'created','?')
      || ' with a canonical origin record');
END $$;

-- ===========================================================================
-- ACT-05 — repeated identical condition de-duplicates onto occurrence history
-- ===========================================================================
DO $$
DECLARE a record; s record; r jsonb; ok boolean; before_n int; after_n int; ev int;
BEGIN
  SELECT * INTO a FROM act_actor; SELECT * INTO s FROM act_state;
  SELECT count(*) INTO before_n FROM public.supervisory_attention;
  PERFORM pg_temp.act_as(a.uid);
  r := public.supervisory_monitoring_raise_attention(a.entity_id, a.domain_code,
        'OS-02D gate: the same condition observed again (rolled back)');
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO after_n FROM public.supervisory_attention;
  SELECT count(*) INTO ev FROM public.supervisory_attention_event
   WHERE attention_id = s.attention_id AND event_type = 'MONITORING_OCCURRENCE';
  ok := (r->>'deduplicated')::boolean IS TRUE AND (r->>'created')::boolean IS FALSE
    AND after_n = before_n AND (r->>'attention_id')::uuid = s.attention_id AND ev >= 1;
  PERFORM pg_temp.rec('ACT-05','repeat observation de-duplicates', ok,
    'no second attention created (' || before_n || ' -> ' || after_n || '); '
      || ev || ' occurrence event(s) recorded on the existing item');
END $$;

-- ===========================================================================
-- ACT-06 / ACT-07 — reassessment requirement: created once, then de-duplicated
-- ===========================================================================
DO $$
DECLARE a record; r1 jsonb; r2 jsonb; ok boolean; n0 int; n1 int; n2 int;
BEGIN
  SELECT * INTO a FROM act_actor;
  SELECT count(*) INTO n0 FROM public.supervisory_reassessment_requirement;
  PERFORM pg_temp.act_as(a.uid);
  r1 := public.supervisory_monitoring_require_reassessment(a.entity_id, a.domain_code,
         'OS-02D gate: monitoring conditions warrant a targeted reassessment (rolled back)');
  SELECT count(*) INTO n1 FROM public.supervisory_reassessment_requirement;
  r2 := public.supervisory_monitoring_require_reassessment(a.entity_id, a.domain_code,
         'OS-02D gate: same condition observed again (rolled back)');
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO n2 FROM public.supervisory_reassessment_requirement;
  UPDATE act_state SET requirement_id = COALESCE((r1->>'requirement_id')::uuid,
                                                 (r2->>'requirement_id')::uuid);

  ok := (r1->>'requirement_id') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                 WHERE rr.id = (r1->>'requirement_id')::uuid
                   AND rr.entity_id = a.entity_id
                   AND COALESCE(rr.domain_code,'') = a.domain_code);
  PERFORM pg_temp.rec('ACT-06','reassessment requirement written canonically', ok,
    'requirement ' || COALESCE(r1->>'requirement_id','?') || ' created=' || COALESCE(r1->>'created','?')
      || ' (' || n0 || ' -> ' || n1 || ')');

  ok := (r2->>'deduplicated')::boolean IS TRUE AND n2 = n1
    AND (r2->>'requirement_id')::uuid = COALESCE((r1->>'requirement_id')::uuid,
                                                 (r2->>'requirement_id')::uuid);
  PERFORM pg_temp.rec('ACT-07','outstanding reassessment de-duplicates', ok,
    'second call created nothing (' || n1 || ' -> ' || n2 || ') and returned the outstanding requirement');
END $$;

-- ===========================================================================
-- ACT-08 — provenance is required: no canonical basis, no action
-- ===========================================================================
DO $$
DECLARE a record; ok boolean := true; msg text := ''; _ent uuid;
BEGIN
  SELECT * INTO a FROM act_actor;
  SELECT l.id INTO _ent FROM public.licensees l
   WHERE public.supervisory_entity_scope_permits(a.uid, l.id)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment s
                      WHERE s.entity_id = l.id
                        AND COALESCE(s.domain_code,'CROSS_DOMAIN') = a.domain_code
                        AND upper(COALESCE(s.status,'')) = 'APPROVED')
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_signal g
                      WHERE g.entity_id = l.id
                        AND COALESCE(g.domain_code,'CROSS_DOMAIN') = a.domain_code)
   ORDER BY l.created_at LIMIT 1;

  IF _ent IS NULL THEN
    PERFORM pg_temp.rec('ACT-08','provenance required', true,
      'no in-scope entity without canonical basis exists in live data; gate not applicable');
  ELSE
    PERFORM pg_temp.act_as(a.uid);
    BEGIN
      PERFORM public.supervisory_monitoring_raise_attention(_ent, a.domain_code,
        'OS-02D gate: attention attempted with no canonical basis (rolled back)');
      ok := false; msg := 'attention created with no canonical basis; ';
    EXCEPTION WHEN OTHERS THEN msg := 'attention refused (' || SQLERRM || '); '; END;
    BEGIN
      PERFORM public.supervisory_monitoring_require_reassessment(_ent, a.domain_code,
        'OS-02D gate: reassessment attempted with no canonical basis (rolled back)');
      ok := false; msg := msg || 'reassessment created with no canonical basis';
    EXCEPTION WHEN OTHERS THEN msg := msg || 'reassessment refused'; END;
    PERFORM pg_temp.act_as_owner();
    PERFORM pg_temp.rec('ACT-08','provenance required', ok, msg);
  END IF;
END $$;

-- ===========================================================================
-- ACT-09 — foreign provenance cannot be attached
-- ===========================================================================
DO $$
DECLARE a record; ok boolean := true; msg text := ''; _sig uuid;
BEGIN
  SELECT * INTO a FROM act_actor;
  SELECT g.id INTO _sig FROM public.supervisory_signal g WHERE g.entity_id <> a.entity_id LIMIT 1;
  IF _sig IS NULL THEN
    -- synthesise a foreign-entity signal through the canonical column contract
    INSERT INTO public.supervisory_signal(entity_id, domain_code, source_kind, severity,
      summary, external_reference)
    VALUES (a.foreign_entity, a.domain_code, 'OTHER_GOVERNED_SOURCE', 'high',
      'ACT-09 foreign provenance fixture (rolled back)', 'ACT-09-FIXTURE')
    RETURNING id INTO _sig;
  END IF;

  PERFORM pg_temp.act_as(a.uid);
  BEGIN
    PERFORM public.supervisory_monitoring_raise_attention(a.entity_id, a.domain_code,
      'OS-02D gate: attention attempted on another entity''s signal (rolled back)', _sig);
    ok := false; msg := 'foreign signal accepted by attention; ';
  EXCEPTION WHEN OTHERS THEN msg := 'attention refused foreign signal (' || SQLERRM || '); '; END;
  BEGIN
    PERFORM public.supervisory_monitoring_require_reassessment(a.entity_id, a.domain_code,
      'OS-02D gate: reassessment attempted on another entity''s signal (rolled back)', _sig);
    ok := false; msg := msg || 'foreign signal accepted by reassessment';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'reassessment refused foreign signal'; END;
  PERFORM pg_temp.act_as_owner();
  PERFORM pg_temp.rec('ACT-09','foreign provenance rejected', ok, msg);
END $$;

-- ===========================================================================
-- ACT-10 — supervisory scope is enforced by the canonical contract
-- ===========================================================================
DO $$
DECLARE a record; ok boolean := true; msg text := ''; _out uuid; _uid uuid;
BEGIN
  SELECT * INTO a FROM act_actor;
  SELECT p.id INTO _uid FROM public.profiles p
   WHERE public.has_any_permission(p.id, ARRAY['supervisory_spine.create','aml_supervision.create',
             'aml_supervision.approve'])
     AND NOT public.supervisory_entity_scope_permits(p.id, a.entity_id)
   ORDER BY p.id LIMIT 1;

  IF _uid IS NULL THEN
    PERFORM pg_temp.rec('ACT-10','supervisory scope enforced', true,
      'every permitted identity in live data is in scope for this entity; gate not applicable');
  ELSE
    PERFORM pg_temp.act_as(_uid);
    BEGIN
      PERFORM public.supervisory_monitoring_raise_attention(a.entity_id, a.domain_code,
        'OS-02D gate: out-of-scope actor attempting attention (rolled back)');
      ok := false; msg := 'out-of-scope actor raised attention';
    EXCEPTION WHEN OTHERS THEN msg := 'refused (' || SQLERRM || ')'; END;
    PERFORM pg_temp.act_as_owner();
    PERFORM pg_temp.rec('ACT-10','supervisory scope enforced', ok, msg);
  END IF;
END $$;

-- ===========================================================================
-- ACT-11 — the authoritative risk rating is unchanged by monitoring action
-- ===========================================================================
DO $$
DECLARE b record; ok boolean; fp text;
BEGIN
  SELECT * INTO b FROM act_baseline;
  SELECT md5(COALESCE(string_agg(rs.entity_id::text || rs.domain_code
           || COALESCE(rs.residual_rating,'-') || COALESCE(rs.driving_assessment_id::text,'-'),
           ',' ORDER BY rs.entity_id, rs.domain_code), '')) INTO fp
    FROM public.entity_risk_state rs;
  ok := fp = b.risk_fingerprint
    AND (SELECT count(*) FROM public.entity_risk_state) = b.risk_states;
  PERFORM pg_temp.rec('ACT-11','authoritative risk rating unchanged', ok,
    'entity_risk_state fingerprint identical after attention + reassessment commands');
END $$;

-- ===========================================================================
-- ACT-12 — no plan / intervention / examination / finding created implicitly
-- ===========================================================================
DO $$
DECLARE b record; ok boolean;
BEGIN
  SELECT * INTO b FROM act_baseline;
  ok := (SELECT count(*) FROM public.supervisory_finding) = b.findings
    AND (SELECT count(*) FROM public.supervisory_remediation_action) = b.remediation
    AND (SELECT count(*) FROM public.examinations) = b.examinations;
  PERFORM pg_temp.rec('ACT-12','no downstream object created implicitly', ok,
    'findings/remediation/examinations unchanged by the monitoring commands');
END $$;

-- ===========================================================================
-- ACT-13 — every command leaves an audit trail
-- ===========================================================================
DO $$
DECLARE s record; ok boolean; n int;
BEGIN
  SELECT * INTO s FROM act_state;
  SELECT count(*) INTO n FROM public.compliance_audit_logs l
   WHERE l.object_id IN (s.attention_id::text, s.requirement_id::text)
     AND l.created_at >= now() - interval '5 minutes';
  ok := n >= 2
    AND EXISTS (SELECT 1 FROM public.supervisory_attention_event e
                 WHERE e.attention_id = s.attention_id);
  PERFORM pg_temp.rec('ACT-13','audit trail written', ok,
    n || ' compliance audit entries for the attention/requirement plus attention event history');
END $$;

-- ===========================================================================
-- ACT-14 — capabilities gate downstream steps with a stated reason
-- ===========================================================================
DO $$
DECLARE a record; cap jsonb; ok boolean; gated int; blank int;
BEGIN
  SELECT * INTO a FROM act_actor;
  PERFORM pg_temp.act_as(a.uid);
  cap := public.supervisory_monitoring_action_capabilities(a.entity_id, a.domain_code);
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO gated FROM jsonb_array_elements(COALESCE(cap->'actions','[]'::jsonb)) x
   WHERE COALESCE(x->>'availability', x->>'state', '') IN ('GATED','BLOCKED','UNAVAILABLE')
      OR (x->>'available') = 'false';
  SELECT count(*) INTO blank FROM jsonb_array_elements(COALESCE(cap->'actions','[]'::jsonb)) x
   WHERE (COALESCE(x->>'availability', x->>'state','') IN ('GATED','BLOCKED','UNAVAILABLE')
          OR (x->>'available') = 'false')
     AND COALESCE(btrim(x->>'reason'),'') = '';
  ok := jsonb_array_length(COALESCE(cap->'actions','[]'::jsonb)) > 0 AND blank = 0;
  PERFORM pg_temp.rec('ACT-14','gated steps carry a stated reason', ok,
    jsonb_array_length(COALESCE(cap->'actions','[]'::jsonb)) || ' actions, ' || gated
      || ' gated, ' || blank || ' without a reason');
END $$;

-- ---------------------------------------------------------------- results
SELECT gate, status, title, detail FROM act_result ORDER BY gate;
SELECT status, count(*) FROM act_result GROUP BY status ORDER BY status;

ROLLBACK;
