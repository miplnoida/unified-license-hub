
-- 1. Add missing columns to notifications table
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered';

CREATE INDEX IF NOT EXISTS idx_notifications_channel ON public.notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_user_channel ON public.notifications(user_id, channel);

-- 2. Add date-range delegation columns to delegation_rules
ALTER TABLE public.delegation_rules
  ADD COLUMN IF NOT EXISTS delegate_from_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS delegate_to_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_until timestamptz;

-- 3. Create ppoc_entity_mappings table for PPOC multi-entity support
CREATE TABLE IF NOT EXISTS public.ppoc_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, licensee_id)
);

ALTER TABLE public.ppoc_entity_mappings ENABLE ROW LEVEL SECURITY;

-- Users can view their own mappings
CREATE POLICY "Users can view own ppoc mappings"
ON public.ppoc_entity_mappings FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins can manage all mappings
CREATE POLICY "Admins can manage ppoc mappings"
ON public.ppoc_entity_mappings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));
