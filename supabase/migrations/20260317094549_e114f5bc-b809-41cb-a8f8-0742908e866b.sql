
-- Create file_uploads table with enhanced security metadata
CREATE TABLE public.file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  file_extension text NOT NULL,
  uploaded_by uuid NOT NULL,
  entity_type text NOT NULL DEFAULT 'general',
  entity_id text,
  bucket_name text NOT NULL DEFAULT 'secure-documents',
  is_quarantined boolean NOT NULL DEFAULT false,
  scan_status text NOT NULL DEFAULT 'pending', -- pending, clean, flagged
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

-- Owner reads own uploads
CREATE POLICY "Users read own uploads" ON public.file_uploads FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));

-- Users insert their own uploads
CREATE POLICY "Users insert uploads" ON public.file_uploads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

-- Admins can update (quarantine, scan status)
CREATE POLICY "Admins update uploads" ON public.file_uploads FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR uploaded_by = auth.uid());

-- Admins can delete
CREATE POLICY "Admins delete uploads" ON public.file_uploads FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR uploaded_by = auth.uid());

-- Indexes
CREATE INDEX idx_file_uploads_uploaded_by ON public.file_uploads(uploaded_by);
CREATE INDEX idx_file_uploads_entity ON public.file_uploads(entity_type, entity_id);

-- Create private storage bucket for secure documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'secure-documents',
  'secure-documents',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/webp','text/plain','text/csv']
);

-- RLS on storage: only authenticated users upload to their own folder
CREATE POLICY "Authenticated users upload to secure-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'secure-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own files
CREATE POLICY "Users read own secure-documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'secure-documents' AND (
  auth.uid()::text = (storage.foldername(name))[1]
  OR has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'supervisor')
));

-- Users can delete their own files
CREATE POLICY "Users delete own secure-documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'secure-documents' AND (
  auth.uid()::text = (storage.foldername(name))[1]
  OR has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'admin')
));
