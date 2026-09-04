DROP INDEX IF EXISTS public.smsp_methodology_semantic_uniq;

CREATE UNIQUE INDEX smsp_methodology_semantic_uniq
  ON public.supervisory_methodology_semantic_profile (methodology_id, semantic_code);