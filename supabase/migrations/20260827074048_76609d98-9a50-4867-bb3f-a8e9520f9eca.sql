-- Post-licence duplicate-request protection (server authoritative).
-- Key: data.license_id + data.service_id. Pre-licence behaviour untouched.

CREATE OR REPLACE FUNCTION public.post_license_open_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'draft','in_progress','submitted','under_review','pending_review','in_review',
    'forwarded','awaiting_approval','pending_approval','query_raised','info_requested',
    'resubmission_requested','resubmission_required','returned_for_correction',
    'resubmitted','payment_pending','awaiting_payment','pending_payment'
  ]::text[]
$$;

REVOKE ALL ON FUNCTION public.post_license_open_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_license_open_statuses() TO authenticated, service_role;

-- Trigger: narrow to rows that carry BOTH a licence and a service in data.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_post_license_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license text := NULLIF(NEW.data->>'license_id','');
  v_service text := NULLIF(NEW.data->>'service_id','');
  v_existing uuid;
BEGIN
  IF v_license IS NULL OR v_service IS NULL THEN
    RETURN NEW;  -- legacy / pre-licence rows: untouched
  END IF;

  IF NOT (NEW.status = ANY (public.post_license_open_statuses())) THEN
    RETURN NEW;  -- terminal states never conflict
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND COALESCE(OLD.data->>'license_id','') = v_license
     AND COALESCE(OLD.data->>'service_id','') = v_service THEN
    RETURN NEW;  -- nothing relevant changed
  END IF;

  -- Serialise concurrent creates on the same licence+service pair.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('post_license_request:' || v_license || ':' || v_service, 0)
  );

  SELECT a.id INTO v_existing
    FROM public.applications a
   WHERE a.id <> NEW.id
     AND COALESCE(a.data->>'license_id','') = v_license
     AND COALESCE(a.data->>'service_id','') = v_service
     AND a.status = ANY (public.post_license_open_statuses())
   ORDER BY a.created_at
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_POST_LICENSE_REQUEST: %', v_existing
      USING ERRCODE = 'unique_violation',
            HINT = v_existing::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_post_license_request ON public.applications;
CREATE TRIGGER trg_prevent_duplicate_post_license_request
  BEFORE INSERT OR UPDATE OF status, data ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_post_license_request();

-- Race guard: partial unique index over open post-licence requests.
DO $mig$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT data->>'license_id' l, data->>'service_id' s
      FROM public.applications
     WHERE NULLIF(data->>'license_id','') IS NOT NULL
       AND NULLIF(data->>'service_id','') IS NOT NULL
       AND status NOT IN ('approved','rejected','cancelled','withdrawn','closed')
     GROUP BY 1,2 HAVING count(*) > 1
  ) d;

  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS applications_post_license_open_uniq
      ON public.applications ((data->>'license_id'), (data->>'service_id'))
      WHERE (data->>'license_id') IS NOT NULL
        AND (data->>'license_id') <> ''
        AND (data->>'service_id') IS NOT NULL
        AND (data->>'service_id') <> ''
        AND status NOT IN ('approved','rejected','cancelled','withdrawn','closed');
  ELSE
    RAISE NOTICE 'Skipping applications_post_license_open_uniq: % duplicate pair(s) present', v_dupes;
  END IF;
END $mig$;
