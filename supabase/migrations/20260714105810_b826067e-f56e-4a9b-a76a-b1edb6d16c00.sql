
-- =========================================================
-- Collaborative Review & Markup: schema
-- =========================================================

-- 1. review_comments -----------------------------------------------------
CREATE TABLE public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('application','registration','return','complaint')),
  entity_id uuid NOT NULL,
  regulator_id uuid NULL,
  workflow_instance_id uuid NULL,
  workflow_step_id uuid NULL,
  field_key text NOT NULL,
  selection_start integer NULL,
  selection_end integer NULL,
  selection_text text NULL,
  author_user_id uuid NOT NULL,
  author_role_id uuid NULL,
  body text NOT NULL,
  parent_comment_id uuid NULL REFERENCES public.review_comments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  is_blocking boolean NOT NULL DEFAULT false,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_comments_entity ON public.review_comments(entity_type, entity_id);
CREATE INDEX idx_review_comments_step ON public.review_comments(workflow_step_id);
CREATE INDEX idx_review_comments_parent ON public.review_comments(parent_comment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_comments TO authenticated;
GRANT ALL ON public.review_comments TO service_role;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

-- 2. review_suggestions --------------------------------------------------
CREATE TABLE public.review_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('application','registration','return','complaint')),
  entity_id uuid NOT NULL,
  regulator_id uuid NULL,
  workflow_instance_id uuid NULL,
  workflow_step_id uuid NULL,
  field_key text NOT NULL,
  author_user_id uuid NOT NULL,
  author_role_id uuid NULL,
  type text NOT NULL CHECK (type IN ('insert','delete','replace')),
  original_text text NULL,
  suggested_text text NULL,
  selection_start integer NULL,
  selection_end integer NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  decided_by uuid NULL,
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_suggestions_entity ON public.review_suggestions(entity_type, entity_id);
CREATE INDEX idx_review_suggestions_step ON public.review_suggestions(workflow_step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_suggestions TO authenticated;
GRANT ALL ON public.review_suggestions TO service_role;
ALTER TABLE public.review_suggestions ENABLE ROW LEVEL SECURITY;

-- 3. review_role_display_settings ---------------------------------------
CREATE TABLE public.review_role_display_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid NULL,
  role_id uuid NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  show_reviewer_name boolean NOT NULL DEFAULT true,
  show_role_name boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, role_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_role_display_settings TO authenticated;
GRANT ALL ON public.review_role_display_settings TO service_role;
ALTER TABLE public.review_role_display_settings ENABLE ROW LEVEL SECURITY;

-- 4. review_step_permissions --------------------------------------------
CREATE TABLE public.review_step_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  step_id uuid NOT NULL,
  role_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  can_view boolean NOT NULL DEFAULT true,
  can_comment boolean NOT NULL DEFAULT false,
  can_reply boolean NOT NULL DEFAULT false,
  can_suggest boolean NOT NULL DEFAULT false,
  can_accept boolean NOT NULL DEFAULT false,
  can_reject boolean NOT NULL DEFAULT false,
  can_resolve boolean NOT NULL DEFAULT false,
  can_mark_blocking boolean NOT NULL DEFAULT false,
  block_approval_on_unresolved_blocking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, role_id)
);
CREATE INDEX idx_review_step_perms_step ON public.review_step_permissions(step_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_step_permissions TO authenticated;
GRANT ALL ON public.review_step_permissions TO service_role;
ALTER TABLE public.review_step_permissions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Shared updated_at trigger (reuse project's function if present)
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $f$ LANGUAGE plpgsql SET search_path = public;
  END IF;
END $$;

CREATE TRIGGER trg_review_comments_updated BEFORE UPDATE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_review_suggestions_updated BEFORE UPDATE ON public.review_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_review_role_display_updated BEFORE UPDATE ON public.review_role_display_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_review_step_perms_updated BEFORE UPDATE ON public.review_step_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Helper: is_admin() shortcut relying on has_role() convention
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_collab_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('admin','super_admin')
  );
$$;

-- =========================================================
-- can_review_action(step_id, role_id, action)
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_review_action(_step_id uuid, _role_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.review_step_permissions%ROWTYPE;
BEGIN
  IF _step_id IS NULL OR _role_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.review_step_permissions WHERE step_id = _step_id AND role_id = _role_id;
  IF NOT FOUND OR NOT r.enabled THEN RETURN false; END IF;
  RETURN CASE _action
    WHEN 'view' THEN r.can_view
    WHEN 'comment' THEN r.can_comment
    WHEN 'reply' THEN r.can_reply
    WHEN 'suggest' THEN r.can_suggest
    WHEN 'accept' THEN r.can_accept
    WHEN 'reject' THEN r.can_reject
    WHEN 'resolve' THEN r.can_resolve
    WHEN 'mark_blocking' THEN r.can_mark_blocking
    ELSE false
  END;
END $$;

-- =========================================================
-- RLS Policies
-- =========================================================

-- review_comments: any signed-in user can read; author writes with own uid & assigned role
CREATE POLICY "collab_comments_select" ON public.review_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "collab_comments_insert" ON public.review_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (author_role_id IS NULL OR EXISTS (
      SELECT 1 FROM public.user_dynamic_roles udr
      WHERE udr.user_id = auth.uid() AND udr.role_id = review_comments.author_role_id
    ))
  );
CREATE POLICY "collab_comments_update" ON public.review_comments FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_collab_admin(auth.uid()))
  WITH CHECK (author_user_id = auth.uid() OR public.is_collab_admin(auth.uid()));
CREATE POLICY "collab_comments_delete" ON public.review_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_collab_admin(auth.uid()));

-- review_suggestions
CREATE POLICY "collab_suggestions_select" ON public.review_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "collab_suggestions_insert" ON public.review_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (author_role_id IS NULL OR EXISTS (
      SELECT 1 FROM public.user_dynamic_roles udr
      WHERE udr.user_id = auth.uid() AND udr.role_id = review_suggestions.author_role_id
    ))
  );
CREATE POLICY "collab_suggestions_update" ON public.review_suggestions FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_collab_admin(auth.uid()))
  WITH CHECK (true);
CREATE POLICY "collab_suggestions_delete" ON public.review_suggestions FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_collab_admin(auth.uid()));

-- Role display settings — readable by any signed-in user; writable by admin only
CREATE POLICY "collab_role_display_select" ON public.review_role_display_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "collab_role_display_admin_write" ON public.review_role_display_settings FOR ALL TO authenticated
  USING (public.is_collab_admin(auth.uid()))
  WITH CHECK (public.is_collab_admin(auth.uid()));

-- Step permissions — readable by authenticated; writable by admin only
CREATE POLICY "collab_step_perms_select" ON public.review_step_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "collab_step_perms_admin_write" ON public.review_step_permissions FOR ALL TO authenticated
  USING (public.is_collab_admin(auth.uid()))
  WITH CHECK (public.is_collab_admin(auth.uid()));

-- =========================================================
-- RPCs
-- =========================================================

-- check_approval_blocked returns { blocked, count } for the current step
CREATE OR REPLACE FUNCTION public.check_approval_blocked(
  _entity_type text, _entity_id uuid, _step_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _enforce boolean; _cnt int;
BEGIN
  IF _step_id IS NULL THEN RETURN jsonb_build_object('blocked', false, 'count', 0); END IF;
  SELECT bool_or(block_approval_on_unresolved_blocking AND enabled) INTO _enforce
    FROM public.review_step_permissions WHERE step_id = _step_id;
  IF NOT COALESCE(_enforce, false) THEN
    RETURN jsonb_build_object('blocked', false, 'count', 0);
  END IF;
  SELECT count(*) INTO _cnt FROM public.review_comments
    WHERE entity_type = _entity_type AND entity_id = _entity_id
      AND is_blocking = true AND status = 'open';
  RETURN jsonb_build_object('blocked', _cnt > 0, 'count', _cnt);
END $$;

-- accept_review_suggestion: atomically apply and mark
CREATE OR REPLACE FUNCTION public.accept_review_suggestion(_suggestion_id uuid)
RETURNS public.review_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.review_suggestions%ROWTYPE; _role uuid;
BEGIN
  SELECT * INTO s FROM public.review_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'suggestion already decided'; END IF;

  -- Verify caller has 'accept' permission on that step under at least one assigned role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_dynamic_roles udr
    WHERE udr.user_id = auth.uid()
      AND public.can_review_action(s.workflow_step_id, udr.role_id, 'accept')
  ) AND NOT public.is_collab_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted to accept suggestions on this step';
  END IF;

  UPDATE public.review_suggestions
     SET status = 'accepted', decided_by = auth.uid(), decided_at = now()
   WHERE id = _suggestion_id
  RETURNING * INTO s;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.reject_review_suggestion(_suggestion_id uuid)
RETURNS public.review_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.review_suggestions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.review_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'suggestion already decided'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_dynamic_roles udr
    WHERE udr.user_id = auth.uid()
      AND public.can_review_action(s.workflow_step_id, udr.role_id, 'reject')
  ) AND NOT public.is_collab_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted to reject suggestions on this step';
  END IF;
  UPDATE public.review_suggestions
     SET status = 'rejected', decided_by = auth.uid(), decided_at = now()
   WHERE id = _suggestion_id
  RETURNING * INTO s;
  RETURN s;
END $$;

GRANT EXECUTE ON FUNCTION public.check_approval_blocked(text,uuid,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_review_suggestion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_review_suggestion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_action(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_collab_admin(uuid) TO authenticated;
