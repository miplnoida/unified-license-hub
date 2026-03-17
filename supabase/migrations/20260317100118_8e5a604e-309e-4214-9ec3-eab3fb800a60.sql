
-- ═══════════════════════════════════════════════════════
-- 1. Full-Text Search: tsvector columns + GIN indexes
-- ═══════════════════════════════════════════════════════

-- Applications: search by application_number, license_type, status
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(application_number, '') || ' ' || coalesce(license_type, '') || ' ' || coalesce(status, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_applications_search ON public.applications USING GIN(search_vector);

-- Licenses: search by license_number, license_type, status
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(license_number, '') || ' ' || coalesce(license_type, '') || ' ' || coalesce(status, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_licenses_search ON public.licenses USING GIN(search_vector);

-- Profiles: search by full_name, email, entity_name
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(entity_name, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_profiles_search ON public.profiles USING GIN(search_vector);

-- Complaints: search by complaint_number, subject, description
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(complaint_number, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_complaints_search ON public.complaints USING GIN(search_vector);

-- ═══════════════════════════════════════════════════════
-- 2. Performance indexes on frequently queried columns
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON public.applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_created ON public.applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_holder ON public.licenses(holder_id);
CREATE INDEX IF NOT EXISTS idx_licenses_valid_until ON public.licenses(valid_until);

CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

CREATE INDEX IF NOT EXISTS idx_compliance_returns_submitter ON public.compliance_returns(submitter_id);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_status ON public.compliance_returns(status);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_due ON public.compliance_returns(due_date);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════
-- 3. Job Queue table for async processing
-- ═══════════════════════════════════════════════════════

CREATE TABLE public.job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- Only service role and admins can manage queue
CREATE POLICY "Service role manages queue" ON public.job_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins read queue" ON public.job_queue
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert queue" ON public.job_queue
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE INDEX idx_job_queue_status_priority ON public.job_queue(status, priority DESC, created_at ASC);
CREATE INDEX idx_job_queue_type ON public.job_queue(type);
