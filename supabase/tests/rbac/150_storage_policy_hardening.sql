-- Slice 16: Storage policy hardening — verify the rewritten policies exist
-- and are wired to is_super_admin / has_permission, with no lingering
-- has_role(...) or is_internal_staff(...) references on the buckets we
-- hardened. Behaviour is exercised via storage.objects RLS in the app;
-- these assertions lock the SQL surface so regressions surface immediately.

BEGIN;
SELECT plan(20);

-- ─── documents ─────────────────────────────────────────────────────────────
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_delete'),
  'documents_delete policy exists'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='documents_delete') LIKE '%has_permission%',
  'documents_delete gates on has_permission'
);

-- ─── secure-documents ──────────────────────────────────────────────────────
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE policyname='secure_documents_read'),
  'secure_documents_read policy exists'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='secure_documents_read') LIKE '%is_super_admin%',
  'secure_documents_read exposes is_super_admin bypass'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='secure_documents_read') NOT LIKE '%is_internal_staff%',
  'secure_documents_read no longer references legacy is_internal_staff'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE policyname='secure_documents_delete'),
  'secure_documents_delete policy exists'
);

-- ─── fp-evidence ───────────────────────────────────────────────────────────
-- MC-12: read access is now object-scoped through fp_can_read_evidence_object,
-- which is strictly narrower than the previous module-wide check: condition
-- evidence resolves to the individual, everything else still requires
-- fit_and_proper.view.
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='fp_evidence_read')
    LIKE '%fp_can_read_evidence_object%',
  'fp_evidence_read delegates to the object-scoped F&P evidence gate'
);
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname='fp_can_read_evidence_object') LIKE '%fit_and_proper%'
  AND (SELECT prosrc FROM pg_proc WHERE proname='fp_can_read_evidence_object') LIKE '%can_read_fp_individual%',
  'the F&P evidence gate resolves fit_and_proper permission and individual scope'
);
SELECT ok(
  (SELECT with_check FROM pg_policies WHERE policyname='fp_evidence_write') LIKE '%upload_documents%',
  'fp_evidence_write requires fit_and_proper.upload_documents'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='fp_evidence_delete') LIKE '%has_permission%',
  'fp_evidence_delete gates on has_permission'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='fp_evidence_read') NOT LIKE '%has_role%',
  'fp_evidence_read has no legacy has_role literal'
);

-- ─── payment-documents ─────────────────────────────────────────────────────
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='payment_documents_read') LIKE '%fee_management%',
  'payment_documents_read gates internal staff via fee_management.view'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='payment_documents_read') NOT LIKE '%has_role%',
  'payment_documents_read has no legacy has_role literal'
);

-- ─── license-certificates ──────────────────────────────────────────────────
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='license_certificates_internal_read') LIKE '%license_management%',
  'license_certificates_internal_read gates on license_management'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='license_certificates_internal_read') NOT LIKE '%has_role%',
  'license_certificates_internal_read has no legacy has_role literal'
);

-- ─── certificate-assets ────────────────────────────────────────────────────
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='certificate_assets_manage') LIKE '%manage_certificates%',
  'certificate_assets_manage requires license_management.manage_certificates'
);

-- ─── branding-assets ───────────────────────────────────────────────────────
SELECT ok(
  (SELECT with_check FROM pg_policies WHERE policyname='branding_assets_upload') LIKE '%settings%',
  'branding_assets_upload requires settings.edit'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE policyname='branding_assets_delete') LIKE '%is_super_admin%',
  'branding_assets_delete exposes super_admin bypass'
);
SELECT ok(
  (SELECT with_check FROM pg_policies WHERE policyname='branding_assets_upload') NOT LIKE '%has_role%',
  'branding_assets_upload has no legacy has_role literal'
);

-- ─── avatars ───────────────────────────────────────────────────────────────
SELECT ok(
  (SELECT with_check FROM pg_policies WHERE policyname='avatars_upload_own') LIKE '%foldername%',
  'avatars_upload_own enforces path-prefix scoping'
);
SELECT ok(
  (SELECT with_check FROM pg_policies WHERE policyname='avatars_upload_own') NOT LIKE '%has_role%',
  'avatars_upload_own has no legacy has_role literal'
);

SELECT * FROM finish();
ROLLBACK;
