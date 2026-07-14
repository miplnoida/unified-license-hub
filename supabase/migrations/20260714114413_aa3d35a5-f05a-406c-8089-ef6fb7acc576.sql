
-- =====================================================================
-- Collaborative Review completion migration
-- =====================================================================

-- 1) Narrative columns on the four entity tables ----------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS assessment_notes text,
  ADD COLUMN IF NOT EXISTS decision_rationale text,
  ADD COLUMN IF NOT EXISTS review_notes text;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS review_notes text;

ALTER TABLE public.returns_filed
  ADD COLUMN IF NOT EXISTS explanations text,
  ADD COLUMN IF NOT EXISTS reviewer_notes text;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS investigation_notes text,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS findings text;

-- 2) Narrative field registry ----------------------------------------
CREATE TABLE IF NOT EXISTS public.review_narrative_fields (
  entity_type text NOT NULL,
  field_key   text NOT NULL,
  table_name  text NOT NULL,
  column_name text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, field_key)
);
GRANT SELECT ON public.review_narrative_fields TO authenticated;
GRANT ALL ON public.review_narrative_fields TO service_role;
ALTER TABLE public.review_narrative_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS narrative_fields_read ON public.review_narrative_fields;
CREATE POLICY narrative_fields_read ON public.review_narrative_fields FOR SELECT TO authenticated USING (true);

INSERT INTO public.review_narrative_fields (entity_type, field_key, table_name, column_name) VALUES
  ('application','assessment_notes','applications','assessment_notes'),
  ('application','decision_rationale','applications','decision_rationale'),
  ('application','review_notes','applications','review_notes'),
  ('registration','review_notes','registrations','review_notes'),
  ('return','explanations','returns_filed','explanations'),
  ('return','reviewer_notes','returns_filed','reviewer_notes'),
  ('complaint','investigation_notes','complaints','investigation_notes'),
  ('complaint','resolution_notes','complaints','resolution_notes'),
  ('complaint','findings','complaints','findings')
ON CONFLICT (entity_type, field_key) DO NOTHING;

-- 3) Access helper ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_review_entity(
  _user_id uuid, _entity_type text, _entity_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _step uuid; _ok boolean;
BEGIN
  IF _user_id IS NULL OR _entity_id IS NULL THEN RETURN false; END IF;

  -- Admins always
  IF public.is_collab_admin(_user_id) THEN RETURN true; END IF;

  -- Direct authorship
  IF _entity_type = 'application' THEN
    SELECT true INTO _ok FROM public.applications WHERE id = _entity_id AND applicant_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'registration' THEN
    SELECT true INTO _ok FROM public.registrations WHERE id = _entity_id AND user_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'complaint' THEN
    SELECT true INTO _ok FROM public.complaints WHERE id = _entity_id AND complainant_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'return' THEN
    SELECT true INTO _ok FROM public.returns_filed r
      WHERE r.id = _entity_id
        AND (r.created_by = _user_id
             OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                        WHERE eua.entity_id = r.entity_id AND eua.user_id = _user_id));
    IF _ok THEN RETURN true; END IF;
  END IF;

  -- Reviewer path: user holds a role with can_view on the current workflow step
  SELECT wi.current_step_id INTO _step
    FROM public.workflow_instances wi
   WHERE wi.entity_id = _entity_id
     AND wi.entity_type = CASE WHEN _entity_type = 'application' THEN 'pre_application' ELSE _entity_type END
   ORDER BY wi.created_at DESC LIMIT 1;

  IF _step IS NULL THEN RETURN false; END IF;

  SELECT true INTO _ok FROM public.review_step_permissions rsp
    JOIN public.user_dynamic_roles udr ON udr.role_id = rsp.role_id
   WHERE rsp.step_id = _step
     AND udr.user_id = _user_id
     AND rsp.enabled = true
     AND rsp.can_view = true
   LIMIT 1;
  RETURN COALESCE(_ok, false);
END $$;
GRANT EXECUTE ON FUNCTION public.can_access_review_entity(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_workflow_step_for(
  _entity_type text, _entity_id uuid
) RETURNS TABLE(instance_id uuid, workflow_id uuid, step_id uuid, regulator_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT wi.id, wi.workflow_id, wi.current_step_id,
         COALESCE(
           (SELECT a.regulator_id FROM public.applications a WHERE a.id = _entity_id),
           (SELECT c.regulator_id FROM public.complaints c WHERE c.id = _entity_id),
           NULL
         )
    FROM public.workflow_instances wi
   WHERE wi.entity_id = _entity_id
     AND wi.entity_type = CASE WHEN _entity_type = 'application' THEN 'pre_application' ELSE _entity_type END
   ORDER BY wi.created_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_workflow_step_for(text,uuid) TO authenticated;

-- 4) Replace insecure SELECT + write policies ------------------------
DROP POLICY IF EXISTS collab_comments_select ON public.review_comments;
DROP POLICY IF EXISTS collab_comments_insert ON public.review_comments;
DROP POLICY IF EXISTS collab_comments_update ON public.review_comments;
DROP POLICY IF EXISTS collab_comments_delete ON public.review_comments;

CREATE POLICY collab_comments_select ON public.review_comments FOR SELECT TO authenticated
  USING (public.can_access_review_entity(auth.uid(), entity_type, entity_id));
-- No direct writes: RPCs only. Admin still gets service_role via SECURITY DEFINER RPCs.
CREATE POLICY collab_comments_admin_manage ON public.review_comments FOR ALL TO authenticated
  USING (public.is_collab_admin(auth.uid())) WITH CHECK (public.is_collab_admin(auth.uid()));

DROP POLICY IF EXISTS collab_suggestions_select ON public.review_suggestions;
DROP POLICY IF EXISTS collab_suggestions_insert ON public.review_suggestions;
DROP POLICY IF EXISTS collab_suggestions_update ON public.review_suggestions;
DROP POLICY IF EXISTS collab_suggestions_delete ON public.review_suggestions;

CREATE POLICY collab_suggestions_select ON public.review_suggestions FOR SELECT TO authenticated
  USING (public.can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY collab_suggestions_admin_manage ON public.review_suggestions FOR ALL TO authenticated
  USING (public.is_collab_admin(auth.uid())) WITH CHECK (public.is_collab_admin(auth.uid()));

-- Revoke direct write grants so ordinary users can only write via RPCs
REVOKE INSERT, UPDATE, DELETE ON public.review_comments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.review_suggestions FROM authenticated;
GRANT SELECT ON public.review_comments TO authenticated;
GRANT SELECT ON public.review_suggestions TO authenticated;

-- 5) Secured RPCs -----------------------------------------------------
-- Helper: assert action permitted; validate role belongs to user
CREATE OR REPLACE FUNCTION public._assert_review_action(
  _user_id uuid, _entity_type text, _entity_id uuid, _step_id uuid, _role_id uuid, _action text
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'REVIEW_UNAUTHENTICATED'; END IF;
  IF NOT public.can_access_review_entity(_user_id, _entity_type, _entity_id) THEN
    RAISE EXCEPTION 'REVIEW_FORBIDDEN_ENTITY';
  END IF;
  IF _role_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_dynamic_roles WHERE user_id=_user_id AND role_id=_role_id) THEN
      RAISE EXCEPTION 'REVIEW_INVALID_ROLE';
    END IF;
    IF public.can_review_action(_step_id, _role_id, _action) THEN RETURN; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_dynamic_roles udr
     WHERE udr.user_id = _user_id
       AND public.can_review_action(_step_id, udr.role_id, _action)
  ) AND NOT public.is_collab_admin(_user_id) THEN
    RAISE EXCEPTION 'REVIEW_FORBIDDEN_ACTION';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_review_comment(
  _entity_type text, _entity_id uuid, _field_key text, _body text,
  _selection jsonb DEFAULT NULL, _is_blocking boolean DEFAULT false,
  _role_id uuid DEFAULT NULL, _parent_comment_id uuid DEFAULT NULL
) RETURNS public.review_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx record; row public.review_comments%ROWTYPE; _act text;
BEGIN
  SELECT * INTO ctx FROM public.current_workflow_step_for(_entity_type, _entity_id);
  _act := CASE WHEN _parent_comment_id IS NOT NULL THEN 'reply'
               WHEN _is_blocking THEN 'mark_blocking' ELSE 'comment' END;
  PERFORM public._assert_review_action(auth.uid(), _entity_type, _entity_id, ctx.step_id, _role_id, _act);

  INSERT INTO public.review_comments (
    entity_type, entity_id, workflow_instance_id, workflow_step_id,
    field_key, body,
    selection_start, selection_end, selection_text,
    author_user_id, author_role_id, is_blocking, parent_comment_id
  ) VALUES (
    _entity_type, _entity_id, ctx.instance_id, ctx.step_id,
    _field_key, _body,
    NULLIF((_selection->>'start')::int, NULL),
    NULLIF((_selection->>'end')::int, NULL),
    _selection->>'text',
    auth.uid(), _role_id, COALESCE(_is_blocking,false), _parent_comment_id
  ) RETURNING * INTO row;
  RETURN row;
END $$;
GRANT EXECUTE ON FUNCTION public.add_review_comment(text,uuid,text,text,jsonb,boolean,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_review_comment(_comment_id uuid, _resolved boolean)
RETURNS public.review_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.review_comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.review_comments WHERE id = _comment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  PERFORM public._assert_review_action(auth.uid(), c.entity_type, c.entity_id, c.workflow_step_id, NULL,
    CASE WHEN _resolved THEN 'resolve' ELSE 'reopen' END);
  UPDATE public.review_comments
     SET status = CASE WHEN _resolved THEN 'resolved' ELSE 'open' END,
         resolved_by = CASE WHEN _resolved THEN auth.uid() ELSE NULL END,
         resolved_at = CASE WHEN _resolved THEN now() ELSE NULL END
   WHERE id = _comment_id RETURNING * INTO c;
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_review_comment(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_review_comment_blocking(_comment_id uuid, _blocking boolean)
RETURNS public.review_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.review_comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.review_comments WHERE id = _comment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  PERFORM public._assert_review_action(auth.uid(), c.entity_type, c.entity_id, c.workflow_step_id, NULL, 'mark_blocking');
  UPDATE public.review_comments SET is_blocking = _blocking WHERE id = _comment_id RETURNING * INTO c;
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.set_review_comment_blocking(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_review_suggestion(
  _entity_type text, _entity_id uuid, _field_key text, _type text,
  _original_text text, _suggested_text text, _selection jsonb, _role_id uuid DEFAULT NULL
) RETURNS public.review_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx record; row public.review_suggestions%ROWTYPE;
BEGIN
  IF _type NOT IN ('insert','delete','replace') THEN RAISE EXCEPTION 'REVIEW_BAD_SUGGESTION_TYPE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.review_narrative_fields WHERE entity_type=_entity_type AND field_key=_field_key) THEN
    RAISE EXCEPTION 'REVIEW_UNKNOWN_FIELD';
  END IF;
  SELECT * INTO ctx FROM public.current_workflow_step_for(_entity_type, _entity_id);
  PERFORM public._assert_review_action(auth.uid(), _entity_type, _entity_id, ctx.step_id, _role_id, 'suggest');

  INSERT INTO public.review_suggestions (
    entity_type, entity_id, workflow_instance_id, workflow_step_id,
    field_key, author_user_id, author_role_id, type,
    original_text, suggested_text, selection_start, selection_end
  ) VALUES (
    _entity_type, _entity_id, ctx.instance_id, ctx.step_id,
    _field_key, auth.uid(), _role_id, _type,
    _original_text, _suggested_text,
    NULLIF((_selection->>'start')::int, NULL),
    NULLIF((_selection->>'end')::int, NULL)
  ) RETURNING * INTO row;
  RETURN row;
END $$;
GRANT EXECUTE ON FUNCTION public.create_review_suggestion(text,uuid,text,text,text,text,jsonb,uuid) TO authenticated;

-- Rewrite accept: apply to real narrative
CREATE OR REPLACE FUNCTION public.accept_review_suggestion(_suggestion_id uuid)
RETURNS public.review_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.review_suggestions%ROWTYPE;
  reg record;
  _tbl text; _col text; _current text; _new text; _slice text;
BEGIN
  SELECT * INTO s FROM public.review_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'REVIEW_ALREADY_DECIDED'; END IF;
  PERFORM public._assert_review_action(auth.uid(), s.entity_type, s.entity_id, s.workflow_step_id, NULL, 'accept');

  SELECT table_name, column_name INTO _tbl, _col
    FROM public.review_narrative_fields
   WHERE entity_type = s.entity_type AND field_key = s.field_key;
  IF _tbl IS NULL THEN RAISE EXCEPTION 'REVIEW_UNKNOWN_FIELD'; END IF;

  EXECUTE format('SELECT %I FROM public.%I WHERE id = $1 FOR UPDATE', _col, _tbl)
    USING s.entity_id INTO _current;
  _current := COALESCE(_current, '');

  IF s.type = 'insert' THEN
    IF s.selection_start IS NULL OR s.selection_start < 0 OR s.selection_start > length(_current) THEN
      RAISE EXCEPTION 'REVIEW_SUGGESTION_STALE';
    END IF;
    _new := substr(_current, 1, s.selection_start) || COALESCE(s.suggested_text, '') || substr(_current, s.selection_start + 1);
  ELSE
    IF s.selection_start IS NULL OR s.selection_end IS NULL
       OR s.selection_start < 0 OR s.selection_end > length(_current)
       OR s.selection_end < s.selection_start THEN
      RAISE EXCEPTION 'REVIEW_SUGGESTION_STALE';
    END IF;
    _slice := substr(_current, s.selection_start + 1, s.selection_end - s.selection_start);
    IF s.original_text IS NOT NULL AND _slice <> s.original_text THEN
      RAISE EXCEPTION 'REVIEW_SUGGESTION_STALE';
    END IF;
    IF s.type = 'delete' THEN
      _new := substr(_current, 1, s.selection_start) || substr(_current, s.selection_end + 1);
    ELSE -- replace
      _new := substr(_current, 1, s.selection_start) || COALESCE(s.suggested_text, '') || substr(_current, s.selection_end + 1);
    END IF;
  END IF;

  EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', _tbl, _col) USING _new, s.entity_id;

  UPDATE public.review_suggestions
     SET status = 'accepted', decided_by = auth.uid(), decided_at = now()
   WHERE id = _suggestion_id RETURNING * INTO s;
  RETURN s;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_review_suggestion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_review_suggestion(_suggestion_id uuid)
RETURNS public.review_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.review_suggestions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.review_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'REVIEW_ALREADY_DECIDED'; END IF;
  PERFORM public._assert_review_action(auth.uid(), s.entity_type, s.entity_id, s.workflow_step_id, NULL, 'reject');
  UPDATE public.review_suggestions
     SET status = 'rejected', decided_by = auth.uid(), decided_at = now()
   WHERE id = _suggestion_id RETURNING * INTO s;
  RETURN s;
END $$;
GRANT EXECUTE ON FUNCTION public.reject_review_suggestion(uuid) TO authenticated;

-- 6) Workflow approval block trigger --------------------------------
CREATE OR REPLACE FUNCTION public.enforce_review_approval_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _et text; _res jsonb;
BEGIN
  IF NEW.action_type IS DISTINCT FROM 'approve' THEN RETURN NEW; END IF;
  IF NEW.entity_type IS NULL OR NEW.entity_id IS NULL OR NEW.step_id IS NULL THEN RETURN NEW; END IF;
  _et := CASE WHEN NEW.entity_type = 'pre_application' THEN 'application' ELSE NEW.entity_type END;
  _res := public.check_approval_blocked(_et, NEW.entity_id, NEW.step_id);
  IF (_res->>'blocked')::boolean THEN
    RAISE EXCEPTION 'REVIEW_BLOCKED:%', (_res->>'count')::int USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_review_approval_block ON public.approval_actions;
CREATE TRIGGER trg_enforce_review_approval_block
  BEFORE INSERT ON public.approval_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_approval_block();

-- 7) Regulator-scoped display reader --------------------------------
CREATE OR REPLACE FUNCTION public.get_review_role_display(_regulator_id uuid)
RETURNS TABLE(role_id uuid, color text, show_reviewer_name boolean, show_role_name boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (d.role_id)
         d.role_id, d.color, d.show_reviewer_name, d.show_role_name
    FROM public.review_role_display_settings d
   WHERE d.regulator_id = _regulator_id OR d.regulator_id IS NULL
   ORDER BY d.role_id, (d.regulator_id IS NULL); -- non-null (regulator-specific) first
$$;
GRANT EXECUTE ON FUNCTION public.get_review_role_display(uuid) TO authenticated;
