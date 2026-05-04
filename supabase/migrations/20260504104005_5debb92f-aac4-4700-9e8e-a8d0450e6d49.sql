
-- ============================================================================
-- Tighten storage.objects INSERT policy on the 'documents' bucket.
--
-- BEFORE: Internal roles (super_admin / admin / supervisor / licensing_officer)
-- could upload to ANY path in the bucket, including arbitrary roots and
-- another applicant's UID prefix. Applicants were already correctly limited
-- to "<uid>/..." prefixes.
--
-- AFTER: Uploads must satisfy a documented path convention enforced by a
-- new SECURITY DEFINER helper. The helper also verifies that internal users
-- are authorized for the entity their upload is attached to.
--
-- ============================================================================
-- Required path convention for the `documents` bucket:
--
--   <auth.uid()>/...                                     -- self folder (any role)
--   applications/<application_id>/...                    -- internal: must be a reviewer
--   entities/<entity_type>/<entity_id>/...               -- internal scoped to known entities
--   reviewers/<reviewer_uid>/...                         -- internal review notes
--
-- Anything else is rejected. Read access continues to be governed by
-- public.user_can_access_document_object(...) which DENIES BY DEFAULT
-- when no matching metadata row exists in `documents` or `file_uploads`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_can_upload_document_object(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  parts text[];
  top text;
  is_internal boolean;
  is_super boolean;
  v_entity_id uuid;
  v_entity_type text;
BEGIN
  IF uid IS NULL OR _object_name IS NULL OR length(_object_name) = 0 THEN
    RETURN false;
  END IF;

  parts := storage.foldername(_object_name);
  IF parts IS NULL OR array_length(parts, 1) IS NULL OR array_length(parts, 1) < 1 THEN
    -- Files at the bucket root are never allowed.
    RETURN false;
  END IF;

  top := parts[1];

  is_super := public.has_role(uid, 'super_admin'::app_role);
  is_internal := is_super
              OR public.has_role(uid, 'admin'::app_role)
              OR public.has_role(uid, 'supervisor'::app_role)
              OR public.has_role(uid, 'licensing_officer'::app_role)
              OR public.has_role(uid, 'analyst'::app_role);

  -- 1) Self folder: any authenticated user may upload under their own UID.
  --    Applicants are restricted to this branch only.
  IF top = uid::text THEN
    RETURN true;
  END IF;

  -- Beyond this point, only internal users can proceed.
  IF NOT is_internal THEN
    RETURN false;
  END IF;

  -- 2) applications/<application_id>/... — application must exist.
  IF top = 'applications' AND array_length(parts, 1) >= 2 THEN
    BEGIN
      v_entity_id := parts[2]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    RETURN EXISTS (SELECT 1 FROM public.applications WHERE id = v_entity_id);
  END IF;

  -- 3) entities/<entity_type>/<entity_id>/... — known entity type + valid uuid.
  IF top = 'entities' AND array_length(parts, 1) >= 3 THEN
    v_entity_type := parts[2];
    BEGIN
      v_entity_id := parts[3]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    IF v_entity_type NOT IN ('application','license','licensee','complaint','return','inspection','enforcement') THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- 4) reviewers/<reviewer_uid>/... — only own folder, super-admin exempt.
  IF top = 'reviewers' AND array_length(parts, 1) >= 2 THEN
    BEGIN
      v_entity_id := parts[2]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    RETURN v_entity_id = uid OR is_super;
  END IF;

  -- Anything else is rejected.
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_upload_document_object(text) IS
$$Decides if auth.uid() may INSERT into storage.objects under the 'documents'
bucket. Enforces the path convention:
  <uid>/...                                  -- self folder (any role)
  applications/<application_id>/...          -- internal reviewers, app must exist
  entities/<entity_type>/<entity_id>/...     -- internal, whitelisted entity types
  reviewers/<reviewer_uid>/...               -- internal review notes (own folder)
Anything else (including bucket-root files) is rejected. Read access remains
governed by public.user_can_access_document_object which denies by default
when no metadata row exists in `documents` or `file_uploads`.$$;

-- Replace the loose INSERT policy with the path-aware one.
DROP POLICY IF EXISTS "Documents bucket: per-user upload" ON storage.objects;
DROP POLICY IF EXISTS "Documents bucket: path-scoped upload" ON storage.objects;

CREATE POLICY "Documents bucket: path-scoped upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_can_upload_document_object(name)
);
