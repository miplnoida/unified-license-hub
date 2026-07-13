
CREATE TABLE IF NOT EXISTS public.return_template_downloads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  licensee_id UUID,
  form_version_ids UUID[] NOT NULL DEFAULT '{}',
  format TEXT NOT NULL CHECK (format IN ('xlsx','xml','xsd')),
  fingerprint TEXT,
  downloaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_rtd_return ON public.return_template_downloads(return_id);
CREATE INDEX IF NOT EXISTS idx_rtd_licensee ON public.return_template_downloads(licensee_id, downloaded_at DESC);

GRANT SELECT, INSERT ON public.return_template_downloads TO authenticated;
GRANT ALL ON public.return_template_downloads TO service_role;

ALTER TABLE public.return_template_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rtd_select_owner_or_staff"
  ON public.return_template_downloads FOR SELECT
  TO authenticated
  USING (
    downloaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR (licensee_id IS NOT NULL AND public.can_current_user_access_licensee(licensee_id, NULL))
  );

CREATE POLICY "rtd_insert_self"
  ON public.return_template_downloads FOR INSERT
  TO authenticated
  WITH CHECK (downloaded_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.return_upload_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  licensee_id UUID,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  storage_path TEXT,
  form_version_ids UUID[] NOT NULL DEFAULT '{}',
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','validated','invalid','imported','cancelled','failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rua_return ON public.return_upload_attempts(return_id);
CREATE INDEX IF NOT EXISTS idx_rua_licensee ON public.return_upload_attempts(licensee_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.return_upload_attempts TO authenticated;
GRANT ALL ON public.return_upload_attempts TO service_role;

ALTER TABLE public.return_upload_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rua_select_owner_or_staff"
  ON public.return_upload_attempts FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR (licensee_id IS NOT NULL AND public.can_current_user_access_licensee(licensee_id, NULL))
  );

CREATE POLICY "rua_insert_self"
  ON public.return_upload_attempts FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "rua_update_self"
  ON public.return_upload_attempts FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE TRIGGER trg_rua_updated_at
  BEFORE UPDATE ON public.return_upload_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.return_upload_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.return_upload_attempts(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (strategy IN ('replace','fill_blanks')),
  values_written INT NOT NULL DEFAULT 0,
  forms_touched UUID[] NOT NULL DEFAULT '{}',
  committed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rui_upload ON public.return_upload_imports(upload_id);

GRANT SELECT, INSERT ON public.return_upload_imports TO authenticated;
GRANT ALL ON public.return_upload_imports TO service_role;

ALTER TABLE public.return_upload_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rui_select_owner_or_staff"
  ON public.return_upload_imports FOR SELECT
  TO authenticated
  USING (
    committed_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.return_upload_attempts a
      WHERE a.id = return_upload_imports.upload_id
        AND a.licensee_id IS NOT NULL
        AND public.can_current_user_access_licensee(a.licensee_id, NULL)
    )
  );

CREATE POLICY "rui_insert_self"
  ON public.return_upload_imports FOR INSERT
  TO authenticated
  WITH CHECK (committed_by = auth.uid());

DROP POLICY IF EXISTS "return_uploads_owner_read" ON storage.objects;
CREATE POLICY "return_uploads_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'return-uploads'
    AND (
      owner = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR has_role(auth.uid(), 'analyst'::app_role)
      OR has_role(auth.uid(), 'licensing_officer'::app_role)
    )
  );

DROP POLICY IF EXISTS "return_uploads_owner_write" ON storage.objects;
CREATE POLICY "return_uploads_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'return-uploads' AND owner = auth.uid());

DROP POLICY IF EXISTS "return_uploads_owner_delete" ON storage.objects;
CREATE POLICY "return_uploads_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'return-uploads' AND owner = auth.uid());

CREATE OR REPLACE FUNCTION public.import_return_form_data(
  _return_id UUID,
  _strategy TEXT,
  _rows JSONB
)
RETURNS TABLE(values_written INT, forms_touched UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_form_id UUID;
  v_version_id UUID;
  v_field_id TEXT;
  v_field_name TEXT;
  v_field_value TEXT;
  v_existing TEXT;
  v_written INT := 0;
  v_forms UUID[] := '{}';
  v_authorized BOOLEAN;
BEGIN
  IF _strategy NOT IN ('replace','fill_blanks') THEN
    RAISE EXCEPTION 'invalid strategy %', _strategy USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = _return_id
      AND (
        (p.licensee_id IS NOT NULL
          AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized to import into this return' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_form_id := (v_row->>'form_id')::UUID;
    v_version_id := NULLIF(v_row->>'form_version_id','')::UUID;
    v_field_id := v_row->>'field_id';
    v_field_name := v_row->>'field_name';
    v_field_value := v_row->>'field_value';

    IF v_form_id IS NULL OR v_field_id IS NULL OR v_field_name IS NULL THEN
      CONTINUE;
    END IF;

    IF _strategy = 'fill_blanks' THEN
      SELECT field_value INTO v_existing
      FROM public.return_form_data
      WHERE return_id = _return_id AND form_id = v_form_id AND field_id = v_field_id;
      IF v_existing IS NOT NULL AND v_existing <> '' THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.return_form_data
      (return_id, form_id, field_id, field_name, field_value, form_version_id)
    VALUES
      (_return_id, v_form_id, v_field_id, v_field_name, COALESCE(v_field_value,''), v_version_id)
    ON CONFLICT (return_id, form_id, field_id)
    DO UPDATE SET
      field_value = EXCLUDED.field_value,
      field_name = EXCLUDED.field_name,
      form_version_id = COALESCE(EXCLUDED.form_version_id, public.return_form_data.form_version_id),
      updated_at = now();

    v_written := v_written + 1;
    IF NOT (v_form_id = ANY(v_forms)) THEN
      v_forms := array_append(v_forms, v_form_id);
    END IF;
  END LOOP;

  values_written := v_written;
  forms_touched := v_forms;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_return_form_data(UUID, TEXT, JSONB) TO authenticated;
