-- ─────────────────────────────────────────────────────────────────────────────
-- Add a dashboard_tier flag to the dynamic roles table so an internal role can
-- be marked "executive" (richer, cross-module KPI dashboard at /dashboard) vs
-- the default "operational" (the existing SupervisoryDashboard). Follows the
-- exact same precedent as this table's role_type column
-- (20260617124239_109d350e-73bf-4849-b657-01b752449a23.sql) — a plain
-- ALTER TABLE with a CHECK constraint, no new enum, no ripple through AppRole.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS dashboard_tier text NOT NULL DEFAULT 'operational'
    CHECK (dashboard_tier IN ('operational', 'executive'));
