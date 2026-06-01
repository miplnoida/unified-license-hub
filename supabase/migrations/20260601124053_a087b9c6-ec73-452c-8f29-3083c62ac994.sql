
CREATE OR REPLACE FUNCTION public.set_payment_remarks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.payment_remarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name TEXT,
  author_role TEXT,
  remark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_remarks_payment_id ON public.payment_remarks(payment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_remarks TO authenticated;
GRANT ALL ON public.payment_remarks TO service_role;

ALTER TABLE public.payment_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payment remarks"
ON public.payment_remarks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_remarks.payment_id));

CREATE POLICY "Internal staff can insert remarks"
ON public.payment_remarks FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role IN ('super_admin','admin','regulator_staff','reviewer','approver')
  )
);

CREATE POLICY "Author or admin can update remarks"
ON public.payment_remarks FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role IN ('super_admin','admin'))
);

CREATE POLICY "Author or admin can delete remarks"
ON public.payment_remarks FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role IN ('super_admin','admin'))
);

CREATE TRIGGER trg_payment_remarks_updated_at
BEFORE UPDATE ON public.payment_remarks
FOR EACH ROW EXECUTE FUNCTION public.set_payment_remarks_updated_at();
