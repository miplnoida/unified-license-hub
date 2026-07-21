
-- Slice 16: Storage policy hardening.
-- Replace legacy has_role(...) + is_internal_staff gating on private buckets
-- with the canonical is_super_admin OR has_permission(module, action) model.
-- Buckets covered: documents, secure-documents, fp-evidence, payment-documents,
-- license-certificates, certificate-assets, branding-assets, avatars.

-- ─── documents ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Documents bucket: owner or admin delete" ON storage.objects;
CREATE POLICY "documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'licensee_management', 'delete')
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_path = objects.name AND d.uploaded_by = auth.uid()
      )
    )
  );

-- ─── secure-documents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own secure-documents" ON storage.objects;
CREATE POLICY "secure_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'secure-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
      OR public.has_permission(auth.uid(), 'audit_management', 'view')
    )
  );

DROP POLICY IF EXISTS "Users delete own secure-documents" ON storage.objects;
CREATE POLICY "secure_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'secure-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

-- ─── fp-evidence ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Internal FP staff read fp-evidence" ON storage.objects;
CREATE POLICY "fp_evidence_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fp-evidence'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'fit_and_proper', 'view')
    )
  );

DROP POLICY IF EXISTS "Internal FP staff upload fp-evidence" ON storage.objects;
CREATE POLICY "fp_evidence_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fp-evidence'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'fit_and_proper', 'upload_documents')
      OR public.has_permission(auth.uid(), 'fit_and_proper', 'edit')
    )
  );

DROP POLICY IF EXISTS "Internal FP staff delete fp-evidence" ON storage.objects;
CREATE POLICY "fp_evidence_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fp-evidence'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'fit_and_proper', 'delete')
    )
  );

-- ─── payment-documents ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own payment docs" ON storage.objects;
CREATE POLICY "payment_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_permission(auth.uid(), 'fee_management', 'view')
    )
  );

DROP POLICY IF EXISTS "Users delete own payment docs" ON storage.objects;
CREATE POLICY "payment_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

-- ─── license-certificates ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "license_certificates internal read" ON storage.objects;
CREATE POLICY "license_certificates_internal_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'license-certificates'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'license_management', 'view')
      OR public.has_permission(auth.uid(), 'license_management', 'manage_certificates')
    )
  );

-- ─── certificate-assets ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage certificate-assets" ON storage.objects;
CREATE POLICY "certificate_assets_manage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'certificate-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'license_management', 'manage_certificates')
    )
  )
  WITH CHECK (
    bucket_id = 'certificate-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'license_management', 'manage_certificates')
    )
  );

-- ─── branding-assets ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins upload branding assets" ON storage.objects;
CREATE POLICY "branding_assets_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'settings', 'edit')
    )
  );

DROP POLICY IF EXISTS "Admins update branding assets" ON storage.objects;
CREATE POLICY "branding_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'settings', 'edit')
    )
  );

DROP POLICY IF EXISTS "Admins delete branding assets" ON storage.objects;
CREATE POLICY "branding_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'settings', 'edit')
    )
  );

-- ─── avatars (self-service; keep path-prefix scope, drop legacy admin literal)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "avatars_upload_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.is_super_admin(auth.uid())
      OR (auth.uid())::text = (storage.foldername(name))[1]
    )
  );
