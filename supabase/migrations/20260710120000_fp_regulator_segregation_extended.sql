-- ─────────────────────────────────────────────────────────────────────────────
-- Extend multi-regulator segregation (started in
-- 20260708100000_fp_determinations_regulator_segregation.sql for
-- fp_determinations only) to the rest of the Fit & Proper tables: today any
-- internal FP staff member can read/write EVERY regulator's individuals,
-- assessments, committees, committee membership/votes, and conditions,
-- regardless of which regulator profiles.regulator_id assigns them to.
--
-- Same model as before: profiles.regulator_id is nullable — NULL means "not
-- regulator-scoped", so existing/unassigned staff keep seeing everything
-- until an admin explicitly assigns them a regulator. super_admin always
-- bypasses the scoping, matching every other policy in this module.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fp_regulator_visible(_row_regulator_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.fp_user_regulator_id(auth.uid()) IS NULL
    OR _row_regulator_id IS NULL
    OR _row_regulator_id = public.fp_user_regulator_id(auth.uid());
$$;

-- ── fp_individuals (regulator_id is a direct column) ───────────────────────
DROP POLICY IF EXISTS "Internal staff read individuals" ON public.fp_individuals;
CREATE POLICY "Internal staff read individuals" ON public.fp_individuals FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

DROP POLICY IF EXISTS "Internal staff manage individuals" ON public.fp_individuals;
CREATE POLICY "Internal staff manage individuals" ON public.fp_individuals FOR INSERT TO authenticated
  WITH CHECK (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

DROP POLICY IF EXISTS "Internal staff update individuals" ON public.fp_individuals;
CREATE POLICY "Internal staff update individuals" ON public.fp_individuals FOR UPDATE TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

DROP POLICY IF EXISTS "Internal staff delete individuals" ON public.fp_individuals;
CREATE POLICY "Internal staff delete individuals" ON public.fp_individuals FOR DELETE TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

-- ── fp_assessments (regulator_id is a direct column) ───────────────────────
DROP POLICY IF EXISTS "Internal staff read fp assess" ON public.fp_assessments;
CREATE POLICY "Internal staff read fp assess" ON public.fp_assessments FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

DROP POLICY IF EXISTS "Staff updates fp assess" ON public.fp_assessments;
CREATE POLICY "Staff updates fp assess" ON public.fp_assessments FOR UPDATE TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

-- ── fp_committees (regulator_id is a direct column) ────────────────────────
-- "Admin manages committees" is gated on the global admin/super_admin role,
-- not is_fp_staff, so it's left as-is — admin is already an app-wide role
-- elsewhere in this module (e.g. fp_screening_configs), not one scoped to a
-- single regulator's day-to-day staff.
DROP POLICY IF EXISTS "Internal reads committees" ON public.fp_committees;
CREATE POLICY "Internal reads committees" ON public.fp_committees FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()) AND public.fp_regulator_visible(regulator_id));

-- ── fp_committee_members (scoped via parent committee's regulator_id) ──────
DROP POLICY IF EXISTS "Internal reads cmt members" ON public.fp_committee_members;
CREATE POLICY "Internal reads cmt members" ON public.fp_committee_members FOR SELECT TO authenticated
  USING (
    (public.is_fp_staff(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.fp_committees c
      WHERE c.id = fp_committee_members.committee_id AND public.fp_regulator_visible(c.regulator_id)
    ))
    OR user_id = auth.uid()
  );

-- ── fp_committee_votes (scoped via committee_id's regulator_id) ────────────
DROP POLICY IF EXISTS "Internal reads votes" ON public.fp_committee_votes;
CREATE POLICY "Internal reads votes" ON public.fp_committee_votes FOR SELECT TO authenticated
  USING (
    public.is_fp_staff(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.fp_committees c
      WHERE c.id = fp_committee_votes.committee_id AND public.fp_regulator_visible(c.regulator_id)
    )
  );

-- ── fp_conditions (scoped via individual_id's regulator_id) ────────────────
DROP POLICY IF EXISTS "Internal reads fp conditions" ON public.fp_conditions;
CREATE POLICY "Internal reads fp conditions" ON public.fp_conditions FOR SELECT TO authenticated
  USING (
    public.is_fp_staff(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.fp_individuals i
      WHERE i.id = fp_conditions.individual_id AND public.fp_regulator_visible(i.regulator_id)
    )
  );

DROP POLICY IF EXISTS "Internal manages fp conditions" ON public.fp_conditions;
CREATE POLICY "Internal manages fp conditions" ON public.fp_conditions FOR ALL TO authenticated
  USING (
    public.is_fp_staff(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.fp_individuals i
      WHERE i.id = fp_conditions.individual_id AND public.fp_regulator_visible(i.regulator_id)
    )
  )
  WITH CHECK (
    public.is_fp_staff(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.fp_individuals i
      WHERE i.id = fp_conditions.individual_id AND public.fp_regulator_visible(i.regulator_id)
    )
  );
