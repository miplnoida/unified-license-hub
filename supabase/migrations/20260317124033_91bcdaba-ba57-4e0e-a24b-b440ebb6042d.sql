
-- Create complaint_types table
CREATE TABLE public.complaint_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.complaint_types ENABLE ROW LEVEL SECURITY;

-- Admins manage complaint types
CREATE POLICY "Admins manage complaint types"
  ON public.complaint_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Anyone can read complaint types
CREATE POLICY "Anyone reads complaint types"
  ON public.complaint_types FOR SELECT TO authenticated
  USING (true);

-- Add complaint_type_id to complaints table
ALTER TABLE public.complaints ADD COLUMN complaint_type_id UUID REFERENCES public.complaint_types(id);
