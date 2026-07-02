
CREATE TABLE public.document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  source_type text,
  source_id text,
  preset text NOT NULL DEFAULT 'generic',
  status text NOT NULL DEFAULT 'queued',
  extracted jsonb,
  raw_text text,
  model text,
  input_tokens integer,
  output_tokens integer,
  error text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_extractions TO authenticated;
GRANT ALL ON public.document_extractions TO service_role;

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read all document extractions"
  ON public.document_extractions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own extraction requests"
  ON public.document_extractions FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid() OR requested_by IS NULL);

CREATE POLICY "Users can update their own extraction requests"
  ON public.document_extractions FOR UPDATE
  TO authenticated
  USING (requested_by = auth.uid());

CREATE TRIGGER trg_document_extractions_updated_at
  BEFORE UPDATE ON public.document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_doc_extractions_file ON public.document_extractions(file_upload_id);
CREATE INDEX idx_doc_extractions_source ON public.document_extractions(source_type, source_id);
