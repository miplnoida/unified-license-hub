-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-regulator determinations: enforce segregation, not just data storage.
--
-- fp_determinations.regulator_id + its per-regulator unique index already let
-- two regulators hold independent "current" determinations for the same
-- individual/assessment. This migration closes the gap that any internal FP
-- staff member could read AND write every regulator's determinations
-- regardless of which regulator they belong to.
--
-- Model: profiles.regulator_id assigns an internal staff member to a single
-- regulator (nullable — NULL means "not regulator-scoped", so existing staff
-- keep seeing everything until explicitly assigned). super_admin always sees
-- everything, matching its role elsewhere in this module.
-- ─────────────────────────────────────────────────────────────────────────────

-- FpaDeterminations.tsx submits outcome values 'fit'/'not_fit' (the natural
-- Fit & Proper vocabulary for this UI) alongside the legacy panel's
-- 'approved'/'rejected'/'withdrawn' — widen the constraint so both coexist
-- rather than breaking every "Fit"/"Not Fit" insert from this page.
ALTER TABLE public.fp_determinations DROP CONSTRAINT IF EXISTS fp_determinations_outcome_check;
ALTER TABLE public.fp_determinations ADD CONSTRAINT fp_determinations_outcome_check
  CHECK (outcome = ANY (ARRAY['approved','conditional','rejected','deferred','withdrawn','fit','not_fit']::text[]));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_regulator ON public.profiles(regulator_id) WHERE regulator_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fp_user_regulator_id(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT regulator_id FROM public.profiles WHERE id = _user_id;
$$;

DROP POLICY IF EXISTS "Internal reads determinations" ON public.fp_determinations;
CREATE POLICY "Internal reads determinations" ON public.fp_determinations FOR SELECT TO authenticated
  USING (
    public.is_fp_staff(auth.uid()) AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.fp_user_regulator_id(auth.uid()) IS NULL
      OR fp_determinations.regulator_id IS NULL
      OR fp_determinations.regulator_id = public.fp_user_regulator_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Internal manages determinations" ON public.fp_determinations;
CREATE POLICY "Internal manages determinations" ON public.fp_determinations FOR ALL TO authenticated
  USING (
    public.is_fp_staff(auth.uid()) AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.fp_user_regulator_id(auth.uid()) IS NULL
      OR fp_determinations.regulator_id IS NULL
      OR fp_determinations.regulator_id = public.fp_user_regulator_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_fp_staff(auth.uid()) AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.fp_user_regulator_id(auth.uid()) IS NULL
      OR fp_determinations.regulator_id IS NULL
      OR fp_determinations.regulator_id = public.fp_user_regulator_id(auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Access-log evidence: a narrow, purpose-built read of audit_logs scoped to a
-- single determination. audit_logs itself is admin/super_admin-only (it spans
-- every module in the app), so this SECURITY DEFINER function lets any FP
-- staff member see who created and viewed a given determination without
-- widening access to the whole audit_logs table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_fp_determination_audit_log(_determination_id UUID)
RETURNS TABLE(
  id UUID,
  action TEXT,
  user_id UUID,
  actor_name TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT al.id, al.action, al.user_id, p.full_name, al.created_at, al.metadata
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.id = al.user_id
  WHERE al.entity_type = 'fp_determination'
    AND al.entity_id = _determination_id::text
    AND public.is_fp_staff(auth.uid())
  ORDER BY al.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_fp_determination_audit_log(UUID) TO authenticated;
