ALTER TABLE public.supervisory_methodology_question
  DROP CONSTRAINT IF EXISTS smq_axis_chk;

ALTER TABLE public.supervisory_methodology_question
  ADD CONSTRAINT smq_axis_chk
  CHECK (axis IS NULL OR axis IN (
    'INHERENT_EXPOSURE','CONTROL_EFFECTIVENESS','DESIGN','OPERATING',
    'DESIGN_AND_OPERATING','CONTEXT'));