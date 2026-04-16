
-- Create payment_attachments table
CREATE TABLE public.payment_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  bucket_name TEXT NOT NULL DEFAULT 'payment-documents',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_attachments ENABLE ROW LEVEL SECURITY;

-- Users can view attachments on payments they own
CREATE POLICY "Users can view own payment attachments"
ON public.payment_attachments FOR SELECT
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

-- Users can insert attachments
CREATE POLICY "Users can upload payment attachments"
ON public.payment_attachments FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Users can delete their own attachments
CREATE POLICY "Users can delete own payment attachments"
ON public.payment_attachments FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid());

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-documents', 'payment-documents', false);

-- Storage policies
CREATE POLICY "Users upload payment docs to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users view own payment docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users delete own payment docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
