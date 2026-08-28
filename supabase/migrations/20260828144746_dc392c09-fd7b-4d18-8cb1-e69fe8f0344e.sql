-- =====================================================================
-- F4-B PART 3: privileges, provisioning outbox, canonical linkage, withdrawal
-- =====================================================================

-- ---------------------------------------------------------------------
-- GAP-F4-06: registry-derived privilege census + least privilege
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.f4_estate_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT c.relname::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND (c.relname = ANY (ARRAY['applications','licenses','entity_licenses','registration_licensing_handoffs'])
          OR c.relname LIKE 'application\_%'
          OR c.relname LIKE 'license\_%'
          OR c.relname LIKE 'licensing\_%')
$$;

DO $$
DECLARE
  t text;
  v_cmd text;
  has_policy boolean;
BEGIN
  FOR t IN SELECT table_name FROM public.f4_estate_tables() LOOP
    -- anon may never write anywhere in the licensing estate.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    BEGIN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon', t);
    EXCEPTION WHEN others THEN NULL;
    END;

    -- Structural privileges are never needed by end users.
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    BEGIN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM authenticated', t);
    EXCEPTION WHEN others THEN NULL;
    END;

    -- Keep DML for authenticated only where an RLS policy actually allows it.
    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t
           AND p.permissive = 'PERMISSIVE'
           AND p.cmd IN (v_cmd, 'ALL')
           AND (p.roles = '{public}' OR 'authenticated' = ANY (p.roles))
      ) INTO has_policy;

      IF NOT has_policy THEN
        EXECUTE format('REVOKE %s ON public.%I FROM authenticated', v_cmd, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.v_f4_privilege_census AS
SELECT c.relname AS table_name,
       g.grantee,
       g.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a ON true
  JOIN LATERAL (SELECT a.privilege_type AS privilege_type,
                       COALESCE(pg_get_userbyid(a.grantee), 'PUBLIC') AS grantee) g ON true
 WHERE n.nspname = 'public'
   AND c.relname IN (SELECT table_name FROM public.f4_estate_tables())
   AND g.grantee IN ('anon','authenticated');

GRANT SELECT ON public.v_f4_privilege_census TO authenticated;

-- ---------------------------------------------------------------------
-- GAP-F4-08: idempotent provisioning outbox (replaces post-commit HTTP hope)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.licensing_provisioning_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  task_key text NOT NULL CHECK (task_key IN ('portal_access','license_certificate')),
  license_id uuid,
  entity_id uuid,
  applicant_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  last_error text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, task_key)
);

CREATE INDEX IF NOT EXISTS licensing_provisioning_outbox_due_idx
  ON public.licensing_provisioning_outbox (status, next_attempt_at);

GRANT SELECT ON public.licensing_provisioning_outbox TO authenticated;
GRANT ALL ON public.licensing_provisioning_outbox TO service_role;
ALTER TABLE public.licensing_provisioning_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can monitor licensing provisioning" ON public.licensing_provisioning_outbox;
CREATE POLICY "Staff can monitor licensing provisioning"
  ON public.licensing_provisioning_outbox FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'application_management', 'view'));

DROP TRIGGER IF EXISTS trg_licensing_provisioning_outbox_updated_at ON public.licensing_provisioning_outbox;
CREATE TRIGGER trg_licensing_provisioning_outbox_updated_at
  BEFORE UPDATE ON public.licensing_provisioning_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.licensing_provisioning_enqueue(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_license record;
  v_inserted int := 0;
BEGIN
  SELECT a.id, a.applicant_id, a.entity_id, a.application_number
    INTO v_app FROM public.applications a WHERE a.id = _application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason','NOT_FOUND');
  END IF;

  SELECT l.id, l.license_number INTO v_license
    FROM public.licenses l
   WHERE l.application_id = _application_id
   ORDER BY l.created_at DESC LIMIT 1;

  INSERT INTO public.licensing_provisioning_outbox
    (application_id, task_key, license_id, entity_id, applicant_id, payload)
  SELECT _application_id, k, v_license.id, v_app.entity_id, v_app.applicant_id,
         jsonb_build_object('application_number', v_app.application_number,
                            'license_number', v_license.license_number)
    FROM unnest(ARRAY['portal_access','license_certificate']) AS k
  ON CONFLICT (application_id, task_key) DO UPDATE
     SET license_id = COALESCE(EXCLUDED.license_id, public.licensing_provisioning_outbox.license_id),
         entity_id  = COALESCE(EXCLUDED.entity_id, public.licensing_provisioning_outbox.entity_id),
         updated_at = now();

  SELECT count(*) INTO v_inserted FROM public.licensing_provisioning_outbox
   WHERE application_id = _application_id;

  RETURN jsonb_build_object('ok', true, 'tasks', v_inserted, 'license_id', v_license.id);
END $$;

REVOKE ALL ON FUNCTION public.licensing_provisioning_enqueue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.licensing_provisioning_enqueue(uuid) TO service_role;

-- Worker-only claim / complete (service role or trusted server context).
CREATE OR REPLACE FUNCTION public.licensing_provisioning_assert_worker()
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'WORKER_ONLY: this operation is service-role only' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.licensing_provisioning_claim(_limit integer DEFAULT 10)
RETURNS SETOF public.licensing_provisioning_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.licensing_provisioning_assert_worker();

  RETURN QUERY
  WITH due AS (
    SELECT id FROM public.licensing_provisioning_outbox
     WHERE status IN ('pending','failed')
       AND attempts < max_attempts
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at
     LIMIT GREATEST(COALESCE(_limit, 10), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.licensing_provisioning_outbox o
     SET status = 'processing',
         attempts = o.attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
   WHERE o.id IN (SELECT id FROM due)
  RETURNING o.*;
END $$;

REVOKE ALL ON FUNCTION public.licensing_provisioning_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.licensing_provisioning_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.licensing_provisioning_complete(_id uuid, _success boolean, _error text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.licensing_provisioning_outbox;
BEGIN
  PERFORM public.licensing_provisioning_assert_worker();

  UPDATE public.licensing_provisioning_outbox o
     SET status = CASE WHEN _success THEN 'succeeded'
                       WHEN o.attempts >= o.max_attempts THEN 'dead_letter'
                       ELSE 'failed' END,
         succeeded_at = CASE WHEN _success THEN now() ELSE o.succeeded_at END,
         last_error = CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'unknown error'), 2000) END,
         next_attempt_at = CASE WHEN _success THEN o.next_attempt_at
                                ELSE now() + (interval '2 minutes' * power(2, LEAST(o.attempts, 6))) END,
         updated_at = now()
   WHERE o.id = _id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason','NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_row.status, 'attempts', v_row.attempts);
END $$;

REVOKE ALL ON FUNCTION public.licensing_provisioning_complete(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.licensing_provisioning_complete(uuid, boolean, text) TO service_role;

CREATE OR REPLACE VIEW public.v_licensing_provisioning_health AS
SELECT status, count(*) AS task_count, min(next_attempt_at) AS earliest_due, max(last_attempt_at) AS last_attempt
  FROM public.licensing_provisioning_outbox GROUP BY status;

GRANT SELECT ON public.v_licensing_provisioning_health TO authenticated;

-- Enqueue at approval time, inside the approval transaction.
CREATE OR REPLACE FUNCTION public.trg_applications_enqueue_provisioning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.licensing_provisioning_enqueue(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_applications_enqueue_provisioning ON public.applications;
CREATE TRIGGER trg_applications_enqueue_provisioning
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_applications_enqueue_provisioning();

-- ---------------------------------------------------------------------
-- GAP-F4-12: entity_licenses is canonical; licensees.license_id is legacy
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.licensees.license_id IS
  'DEPRECATED (F4-B): legacy single-licence pointer. public.entity_licenses is canonical for entity<->licence relationships. Read-only for application code.';

CREATE OR REPLACE FUNCTION public.enforce_licensee_license_id_legacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.license_id IS NOT NULL AND NOT v_trusted THEN
      RAISE EXCEPTION 'LEGACY_COLUMN_READ_ONLY: licensees.license_id is deprecated; use entity_licenses.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.license_id IS DISTINCT FROM OLD.license_id THEN
    IF NEW.license_id IS NOT NULL AND NOT v_trusted THEN
      RAISE EXCEPTION 'LEGACY_COLUMN_READ_ONLY: licensees.license_id is deprecated; use entity_licenses.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Trusted provisioning writes are mirrored into the canonical register.
  IF NEW.license_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.license_id IS DISTINCT FROM OLD.license_id) THEN
    INSERT INTO public.entity_licenses (entity_id, license_id, effective_from)
    SELECT NEW.id, NEW.license_id, COALESCE(l.created_at, now())
      FROM public.licenses l
     WHERE l.id = NEW.license_id
       AND NOT EXISTS (SELECT 1 FROM public.entity_licenses el
                        WHERE el.entity_id = NEW.id AND el.license_id = NEW.license_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_licensees_legacy_license_id ON public.licensees;
CREATE TRIGGER trg_licensees_legacy_license_id
  BEFORE INSERT OR UPDATE OF license_id ON public.licensees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_licensee_license_id_legacy();

-- Backfill the canonical register from the legacy column where unambiguous.
INSERT INTO public.entity_licenses (entity_id, license_id, effective_from)
SELECT l.id, l.license_id, COALESCE(lic.created_at, now())
  FROM public.licensees l
  JOIN public.licenses lic ON lic.id = l.license_id
 WHERE l.license_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.entity_licenses el
                    WHERE el.license_id = l.license_id)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- GAP-F4-14: governed applicant/staff withdrawal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_application(_application_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_is_owner boolean := false;
  v_is_staff boolean := false;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RETURN jsonb_build_object('error','A withdrawal reason is required','code','REASON_REQUIRED','http',422);
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'edit');

  v_is_owner := v_app.applicant_id = v_uid
                OR (v_app.entity_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.entity_user_memberships m
                       WHERE m.entity_id = v_app.entity_id AND m.user_id = v_uid AND m.status = 'APPROVED'));

  IF NOT (v_is_owner OR v_is_staff) THEN
    RETURN jsonb_build_object('error','You cannot withdraw this application','code','FORBIDDEN','http',403);
  END IF;

  IF v_app.status = 'withdrawn' THEN
    RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,'application_id',_application_id);
  END IF;

  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('error',format('Cannot withdraw an application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  UPDATE public.applications
     SET status = 'withdrawn', updated_at = v_now,
         data = COALESCE(data,'{}'::jsonb) || jsonb_build_object(
                  'withdrawn_at', v_now, 'withdrawn_by', v_uid, 'withdrawal_reason', trim(_reason))
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'cancelled', completed_at = v_now, updated_at = v_now
   WHERE entity_id = _application_id AND entity_type = 'application' AND status = 'active';

  INSERT INTO public.approval_actions (application_id, actor_id, action, action_type, comments, responded_at)
  VALUES (_application_id, v_uid, 'withdraw', 'withdraw', trim(_reason), v_now);

  PERFORM public.create_audit_log(v_uid, 'application_withdrawn', 'application', _application_id::text, NULL,
    jsonb_build_object('reason', trim(_reason), 'previous_status', v_app.status,
                       'by_staff', v_is_staff), NULL);

  PERFORM public.create_notification(v_app.applicant_id,
    'Application Withdrawn: ' || COALESCE(v_app.application_number, ''),
    'This application has been withdrawn. Reason: ' || trim(_reason),
    'warning', 'application', _application_id::text);

  RETURN jsonb_build_object('success',true,'http',200,'application_id',_application_id,'status','withdrawn');
END $$;

REVOKE ALL ON FUNCTION public.withdraw_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_application(uuid, text) TO authenticated, service_role;