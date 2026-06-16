
CREATE TABLE public.document_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text,
  document_type text NOT NULL,
  display_name text,
  owner_id uuid NOT NULL,
  current_version_id uuid,
  is_deleted boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_groups TO authenticated;
GRANT ALL ON public.document_groups TO service_role;
ALTER TABLE public.document_groups ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_document_groups_entity ON public.document_groups(entity_type, entity_id);
CREATE INDEX idx_document_groups_owner ON public.document_groups(owner_id);

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.document_groups(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_upload_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  change_note text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_document_versions_group ON public.document_versions(group_id);

ALTER TABLE public.document_groups
  ADD CONSTRAINT document_groups_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

CREATE TABLE public.document_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.document_groups(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('upload','new_version','replace','delete','restore','download','make_current')),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.document_action_logs TO authenticated;
GRANT ALL ON public.document_action_logs TO service_role;
ALTER TABLE public.document_action_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_document_action_logs_group ON public.document_action_logs(group_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_doc_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('super_admin','admin','supervisor','licensing_officer','analyst')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_doc_staff(uuid) TO authenticated;

CREATE POLICY "doc_groups_select_own_or_staff" ON public.document_groups
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_doc_staff(auth.uid()));
CREATE POLICY "doc_groups_insert_own" ON public.document_groups
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "doc_groups_update_own_or_staff" ON public.document_groups
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_doc_staff(auth.uid()));
CREATE POLICY "doc_groups_delete_own_or_staff" ON public.document_groups
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_doc_staff(auth.uid()));

CREATE POLICY "doc_versions_select_via_group" ON public.document_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_groups g
    WHERE g.id = document_versions.group_id
      AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
  ));
CREATE POLICY "doc_versions_insert_via_group" ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.document_groups g
      WHERE g.id = document_versions.group_id
        AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
    )
  );
CREATE POLICY "doc_versions_update_via_group" ON public.document_versions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_groups g
    WHERE g.id = document_versions.group_id
      AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_groups g
    WHERE g.id = document_versions.group_id
      AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
  ));

CREATE POLICY "doc_action_logs_select_via_group" ON public.document_action_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_groups g
    WHERE g.id = document_action_logs.group_id
      AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
  ));
CREATE POLICY "doc_action_logs_insert_self" ON public.document_action_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.document_groups g
      WHERE g.id = document_action_logs.group_id
        AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.tg_document_groups_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_groups_updated_at
  BEFORE UPDATE ON public.document_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_document_groups_set_updated_at();

CREATE OR REPLACE FUNCTION public.create_document_version(
  _group_id uuid,
  _file_upload_id uuid,
  _change_note text DEFAULT NULL,
  _action text DEFAULT 'new_version'
)
RETURNS TABLE (version_id uuid, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _owner uuid;
  _next int;
  _new_id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT owner_id INTO _owner FROM public.document_groups WHERE id = _group_id FOR UPDATE;
  IF _owner IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;
  IF _owner <> _caller AND NOT public.is_doc_staff(_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(MAX(v.version), 0) + 1 INTO _next
    FROM public.document_versions v WHERE v.group_id = _group_id;

  INSERT INTO public.document_versions (group_id, version, file_upload_id, uploaded_by, change_note)
  VALUES (_group_id, _next, _file_upload_id, _caller, _change_note)
  RETURNING id INTO _new_id;

  UPDATE public.document_groups
     SET current_version_id = _new_id, updated_at = now()
   WHERE id = _group_id;

  INSERT INTO public.document_action_logs (group_id, version_id, actor_id, action, details)
  VALUES (_group_id, _new_id, _caller, _action,
          jsonb_build_object('version', _next, 'file_upload_id', _file_upload_id));

  RETURN QUERY SELECT _new_id, _next;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_document_version(uuid, uuid, text, text) TO authenticated;
