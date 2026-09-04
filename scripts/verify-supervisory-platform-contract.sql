-- ============================================================================
-- Supervisory platform contract verifier — CONTRACT-01 … CONTRACT-15
--
-- Proves the platform-level contract of the methodology spine:
--   * configuration authority is domain-specific, never cross-domain
--   * response semantics are owned by a methodology VERSION and frozen with it
--   * axis and effectiveness focus are two distinct, coherent dimensions
--   * an MIPL reference template can never become regulator policy in place
--   * activation requires a recorded regulator approval, with maker/checker
--   * no policy value, no historical assessment record is written
--
-- Every prohibited action is EXECUTED, not inspected: a gate passes only when
-- the database actually refuses. Synthetic fixtures are created inside the
-- transaction and discarded by the final ROLLBACK.
--
--   psql "$SUPABASE_DB_URL" -f scripts/verify-supervisory-platform-contract.sql
-- ============================================================================
\pset pager off
\set ON_ERROR_STOP off
SET client_min_messages = notice;
SET row_security = on;

BEGIN;

CREATE TEMP TABLE contract_gate(gate text primary key, claim text, pass boolean, detail text);
GRANT SELECT, INSERT, UPDATE ON contract_gate TO authenticated;

CREATE FUNCTION pg_temp.gate(_g text, _c text, _p boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO contract_gate(gate, claim, pass, detail) VALUES (_g,_c,_p,_d)
  ON CONFLICT (gate) DO UPDATE SET claim=EXCLUDED.claim, pass=EXCLUDED.pass, detail=EXCLUDED.detail;
$$;

CREATE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub',_uid,'role','authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_none() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims','', true);
$$;

-- ---------------------------------------------------------------------------
-- CONTRACT-01  every supervisory domain declares its own configuration and
--              regulator-approval authority — no shared blanket permission
-- ---------------------------------------------------------------------------
DO $$
DECLARE _domains int; _rows int; _shared int; _missing text;
BEGIN
  SELECT count(DISTINCT domain_code) INTO _domains FROM public.supervisory_methodology;
  SELECT count(*) INTO _rows FROM public.supervisory_domain_authority;

  SELECT string_agg(DISTINCT m.domain_code, ',') INTO _missing
    FROM public.supervisory_methodology m
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_domain_authority a
                      WHERE a.domain_code = m.domain_code);

  PERFORM pg_temp.gate('CONTRACT-01',
    'every domain carrying a methodology has a registered domain authority row',
    _missing IS NULL,
    format('%s domain(s) with methodologies, %s authority row(s), unmapped=%s',
           _domains, _rows, COALESCE(_missing,'(none)')));

  -- A domain must not borrow another domain's manage_config permission.
  SELECT count(*) INTO _shared
    FROM public.supervisory_domain_authority a
    JOIN public.supervisory_domain_authority b
      ON b.domain_code <> a.domain_code
     AND b.manage_config_permission = a.manage_config_permission
   WHERE a.manage_config_permission IS NOT NULL;
  PERFORM pg_temp.gate('CONTRACT-02',
    'no two domains share the same configuration permission, so authority never leaks across domains',
    _shared = 0, format('%s shared mapping(s)', _shared));
END $$;

-- ---------------------------------------------------------------------------
-- CONTRACT-03  cross-domain negative: prudential configuration authority does
--              not confer AML methodology configuration authority (executed)
-- CONTRACT-04  unauthenticated configuration is refused (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _pru uuid; _v11 uuid; _err text; _ok3 boolean := false; _ok4 boolean := false;
BEGIN
  SELECT u.id INTO _pru FROM auth.users u
   WHERE public.has_permission(u.id,'prudential_supervision','manage_config')
     AND NOT public.has_permission(u.id,'aml_supervision','manage_config')
     AND NOT public.is_super_admin(u.id)
   LIMIT 1;
  SELECT id INTO _v11 FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND version = '1.1';

  IF _pru IS NULL OR _v11 IS NULL THEN
    PERFORM pg_temp.gate('CONTRACT-03',
      'a prudential configuration officer cannot configure the AML methodology',
      false, 'no prudential-only identity or no v1.1 fixture available');
  ELSE
    PERFORM pg_temp.act_as(_pru);
    BEGIN
      PERFORM public.supervisory_methodology_parameter_set(_v11, '[]'::jsonb);
      _err := 'no error raised — cross-domain configuration was accepted';
    EXCEPTION WHEN insufficient_privilege THEN _ok3 := true; _err := SQLERRM;
              WHEN others THEN _err := SQLERRM;
    END;
    PERFORM pg_temp.gate('CONTRACT-03',
      'a prudential configuration officer is refused AML methodology configuration',
      _ok3, _err);
  END IF;

  PERFORM pg_temp.act_as_none();
  BEGIN
    PERFORM public.supervisory_domain_require_manage('AML_CFT');
    _err := 'no error raised — an unauthenticated caller was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok4 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-04',
    'an unauthenticated caller is refused supervisory configuration authority', _ok4, _err);
END $$;

-- ---------------------------------------------------------------------------
-- CONTRACT-05  every reference decision targets a real methodology version and
--              a mismatched target is refused (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _untargeted int; _mismatched int; _err text; _ok boolean := false; _id uuid; _other uuid;
BEGIN
  SELECT count(*) INTO _untargeted
    FROM public.supervisory_methodology_reference_decision WHERE methodology_id IS NULL;
  SELECT count(*) INTO _mismatched
    FROM public.supervisory_methodology_reference_decision d
    JOIN public.supervisory_methodology m ON m.id = d.methodology_id
   WHERE m.domain_code <> d.domain_code
      OR m.code <> d.methodology_code
      OR m.version <> d.methodology_version;

  PERFORM pg_temp.gate('CONTRACT-05',
    'every reference decision resolves to exactly the methodology version it names',
    _untargeted = 0 AND _mismatched = 0,
    format('untargeted=%s mismatched=%s', _untargeted, _mismatched));

  SELECT id INTO _id FROM public.supervisory_methodology_reference_decision LIMIT 1;
  SELECT id INTO _other FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND version = '1.0';
  BEGIN
    UPDATE public.supervisory_methodology_reference_decision
       SET methodology_id = _other WHERE id = _id;
    _err := 'no error raised — a decision was re-pointed at a different version';
  EXCEPTION WHEN others THEN _ok := true; _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-06',
    'a recorded reference decision cannot be re-pointed at a different methodology version',
    _ok, _err);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-07  response semantics are owned by the VERSION, and every v1.1
--              question binds to a v1.1-owned profile
-- CONTRACT-08  a question cannot borrow another version's semantic profile
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid; _v10 uuid; _profiles int; _unbound int; _foreign int;
        _q uuid; _p uuid; _err text; _ok boolean := false;
BEGIN
  SELECT id INTO _v11 FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.1';
  SELECT id INTO _v10 FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.0';

  SELECT count(*) INTO _profiles FROM public.supervisory_methodology_semantic_profile
   WHERE methodology_id = _v11 AND active;
  SELECT count(*) INTO _unbound FROM public.supervisory_methodology_question
   WHERE methodology_id = _v11 AND active AND response_semantics_profile_id IS NULL;
  SELECT count(*) INTO _foreign
    FROM public.supervisory_methodology_question q
    JOIN public.supervisory_methodology_semantic_profile p
      ON p.id = q.response_semantics_profile_id
   WHERE q.methodology_id = _v11
     AND (p.methodology_id IS DISTINCT FROM _v11
          OR p.semantic_code IS DISTINCT FROM q.response_semantics_code);

  PERFORM pg_temp.gate('CONTRACT-07',
    'the version owns its published response semantics and every question binds to them',
    _profiles = 5 AND _unbound = 0 AND _foreign = 0,
    format('v1.1 profiles=%s unbound questions=%s foreign/mismatched bindings=%s',
           _profiles, _unbound, _foreign));

  SELECT id INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id = _v10 LIMIT 1;
  SELECT id INTO _p FROM public.supervisory_methodology_semantic_profile
   WHERE methodology_id = _v11 LIMIT 1;
  BEGIN
    UPDATE public.supervisory_methodology_question
       SET response_semantics_profile_id = _p WHERE id = _q;
    _err := 'no error raised — a v1.0 question adopted a v1.1 semantic profile';
  EXCEPTION WHEN others THEN _ok := true; _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-08',
    'a question of one version cannot adopt the response semantics of another version',
    _ok, _err);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-09  semantic profiles freeze with the version that owns them
--              (executed against a synthetic frozen fixture)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _fix uuid; _err text; _ok boolean := false;
BEGIN
  INSERT INTO public.supervisory_methodology(
    domain_code, code, version, name, status, origin)
  VALUES ('AML_CFT','ZZ-CONTRACT-FIXTURE','9.9','Contract probe fixture','ACTIVE','REGULATOR_AUTHORED')
  RETURNING id INTO _fix;

  INSERT INTO public.supervisory_methodology_semantic_profile(
    domain_code, methodology_id, semantic_code, name, definition, active)
  VALUES ('AML_CFT', _fix, 'ZZ_PROBE_SEM', 'Probe semantics',
          jsonb_build_object('probe', true), true);

  BEGIN
    UPDATE public.supervisory_methodology_semantic_profile
       SET definition = jsonb_build_object('probe','rewritten')
     WHERE methodology_id = _fix;
    _err := 'no error raised — a frozen version''s response semantics were rewritten';
  EXCEPTION WHEN others THEN _ok := true; _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-09',
    'the response semantics of a version outside DRAFT/REVIEW are immutable',
    _ok, _err);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-10  axis and effectiveness focus are distinct and coherent
-- CONTRACT-11  an incoherent axis/focus pair is refused (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid; _inh int; _ctl int; _d int; _o int; _dao int; _if int;
        _q uuid; _err text; _ok boolean := false;
BEGIN
  SELECT id INTO _v11 FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.1';

  SELECT count(*) FILTER (WHERE axis='INHERENT_EXPOSURE'),
         count(*) FILTER (WHERE axis='CONTROL_EFFECTIVENESS'),
         count(*) FILTER (WHERE effectiveness_focus='DESIGN'),
         count(*) FILTER (WHERE effectiveness_focus='OPERATING'),
         count(*) FILTER (WHERE effectiveness_focus='DESIGN_AND_OPERATING'),
         count(*) FILTER (WHERE effectiveness_focus='INHERENT_EXPOSURE')
    INTO _inh,_ctl,_d,_o,_dao,_if
    FROM public.supervisory_methodology_question
   WHERE methodology_id = _v11 AND active;

  PERFORM pg_temp.gate('CONTRACT-10',
    'the version carries 17 inherent-exposure and 53 control-effectiveness questions, with focus 17/14/27/12',
    _inh = 17 AND _ctl = 53 AND _if = 17 AND _d = 14 AND _o = 27 AND _dao = 12,
    format('axis inherent=%s control=%s; focus inherent=%s design=%s operating=%s both=%s',
           _inh,_ctl,_if,_d,_o,_dao));

  SELECT id INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id = _v11 AND axis = 'INHERENT_EXPOSURE' LIMIT 1;
  BEGIN
    UPDATE public.supervisory_methodology_question
       SET effectiveness_focus = 'OPERATING' WHERE id = _q;
    _err := 'no error raised — an inherent-exposure question took a control focus';
  EXCEPTION WHEN others THEN _ok := true; _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-11',
    'an inherent-exposure question cannot carry a control-effectiveness focus',
    _ok, _err);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-12  a reference template can never become regulator policy in place
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid; _sa uuid; _err text; _ok boolean := false; _ok2 boolean := false; _origin text;
BEGIN
  SELECT id, origin INTO _v11, _origin FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.1';
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;
  PERFORM pg_temp.act_as(_sa);

  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_v11, 'REVIEW',
      'Contract probe: move the reference draft into reference review.');
    PERFORM public.supervisory_methodology_lifecycle(_v11, 'APPROVED',
      'Contract probe: attempt to approve an MIPL reference template in place.');
    _err := 'no error raised — a reference template was approved in place';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-12',
    'an MIPL reference template cannot be approved or activated in place; a regulator must adopt it',
    _ok AND _origin = 'MIPL_REFERENCE',
    format('origin=%s %s', _origin, _err));

  BEGIN
    UPDATE public.supervisory_methodology SET status='ACTIVE' WHERE id=_v11;
    _err := 'no error raised — a reference template was set ACTIVE directly';
  EXCEPTION WHEN others THEN _ok2 := true; _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-13',
    'a reference template is structurally barred from the operational statuses',
    _ok2, _err);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-14  activation requires a recorded regulator approval, and the
--              author of a version cannot approve it (executed on fixtures)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sa uuid; _fix uuid; _fix2 uuid; _err text; _errA text;
        _okActivate boolean := false; _okMaker boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;

  INSERT INTO public.supervisory_methodology(domain_code, code, version, name, status, origin, created_by)
  VALUES ('AML_CFT','ZZ-CONTRACT-APPROVED','9.9','Approved probe','APPROVED','REGULATOR_AUTHORED', _sa)
  RETURNING id INTO _fix;
  INSERT INTO public.supervisory_methodology(domain_code, code, version, name, status, origin, created_by)
  VALUES ('AML_CFT','ZZ-CONTRACT-REVIEW','9.9','Review probe','REVIEW','REGULATOR_AUTHORED', _sa)
  RETURNING id INTO _fix2;

  PERFORM pg_temp.act_as(_sa);

  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_fix, 'ACTIVE',
      'Contract probe: activate without any recorded regulator approval.');
    _err := 'no error raised — activation succeeded with no regulator approval on record';
  EXCEPTION WHEN insufficient_privilege THEN _okActivate := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-14',
    'a methodology version cannot be activated without a current regulator approval',
    _okActivate, _err);

  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_fix2, 'APPROVED',
      'Contract probe: the author attempts to approve their own version.');
    _errA := 'no error raised — the author approved their own version';
  EXCEPTION WHEN insufficient_privilege THEN _okMaker := true; _errA := SQLERRM;
            WHEN others THEN _errA := SQLERRM;
  END;
  PERFORM pg_temp.gate('CONTRACT-15',
    'the author of a methodology version can never record its regulator approval (maker/checker)',
    _okMaker, _errA);
END $$;
ROLLBACK AND CHAIN;

-- ---------------------------------------------------------------------------
-- CONTRACT-16  no policy value was invented: parameters and facts stay pending
-- CONTRACT-17  no assessment or historical record is bound to the draft
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid; _v10 uuid; _params int; _valued int; _approved int;
        _facts int; _pending int; _assess int; _q10 int; _s10 text;
BEGIN
  SELECT id INTO _v11 FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.1';
  SELECT id, status INTO _v10, _s10 FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.0';

  SELECT count(*),
         count(*) FILTER (WHERE approval_status <> 'UNAPPROVED')
    INTO _params, _approved
    FROM public.supervisory_methodology_parameter WHERE methodology_id = _v11;
  SELECT count(*) INTO _valued FROM public.supervisory_methodology_parameter
   WHERE methodology_id = _v11
     AND (numeric_value IS NOT NULL OR text_value IS NOT NULL OR jsonb_value IS NOT NULL);

  SELECT count(*), count(*) FILTER (WHERE definition_status = 'ATTRIBUTES_PENDING')
    INTO _facts, _pending
    FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = _v11;

  PERFORM pg_temp.gate('CONTRACT-16',
    'no materiality value or fact definition was invented: parameters stay unapproved and valueless, facts stay pending',
    _params = 8 AND _approved = 0 AND _valued = 0 AND _facts = 87 AND _pending = 87,
    format('parameters=%s approved=%s valued=%s facts=%s pending=%s',
           _params, _approved, _valued, _facts, _pending));

  SELECT count(*) INTO _assess FROM public.supervisory_assessment WHERE methodology_id = _v11;
  SELECT count(*) INTO _q10 FROM public.supervisory_methodology_question
   WHERE methodology_id = _v10 AND active;

  PERFORM pg_temp.gate('CONTRACT-17',
    'no assessment is bound to the unapproved draft and the active version is untouched',
    _assess = 0 AND _q10 = 41 AND _s10 = 'ACTIVE',
    format('draft assessments=%s v1.0 questions=%s v1.0 status=%s', _assess, _q10, _s10));
END $$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
SELECT gate,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       claim,
       COALESCE(detail,'') AS detail
  FROM contract_gate
 ORDER BY gate;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
  FROM contract_gate;

ROLLBACK;
