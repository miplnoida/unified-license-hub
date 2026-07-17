
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.complaint_duplicate_scoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true,
  weight_email numeric NOT NULL DEFAULT 40,
  weight_licensee numeric NOT NULL DEFAULT 20,
  weight_subject_trgm numeric NOT NULL DEFAULT 20,
  weight_description_trgm numeric NOT NULL DEFAULT 20,
  time_window_days integer NOT NULL DEFAULT 30,
  min_score numeric NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.complaint_duplicate_scoring_config TO authenticated;
GRANT ALL ON public.complaint_duplicate_scoring_config TO service_role;

ALTER TABLE public.complaint_duplicate_scoring_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read scoring config" ON public.complaint_duplicate_scoring_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage scoring config" ON public.complaint_duplicate_scoring_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

INSERT INTO public.complaint_duplicate_scoring_config (active)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.complaint_duplicate_scoring_config);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duplicate_pair_symmetric
  ON public.complaint_duplicate_pairs (
    LEAST(primary_complaint_id, candidate_complaint_id),
    GREATEST(primary_complaint_id, candidate_complaint_id)
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_complaints_subject_trgm
  ON public.complaints USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complaints_description_trgm
  ON public.complaints USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complaints_email_lower
  ON public.complaints ((lower(email)));

CREATE OR REPLACE FUNCTION public.generate_complaint_duplicate_candidates(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  src RECORD;
  cand RECORD;
  score numeric;
  s_subj numeric;
  s_desc numeric;
  matched jsonb;
  created_count integer := 0;
  lo uuid;
  hi uuid;
BEGIN
  SELECT * INTO cfg FROM public.complaint_duplicate_scoring_config
    WHERE active = true ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT id, regulator_id, licensee_id, email, subject, description, created_at
    INTO src FROM public.complaints WHERE id = _complaint_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR cand IN
    SELECT id, licensee_id, email, subject, description
    FROM public.complaints c
    WHERE c.id <> src.id
      AND c.regulator_id IS NOT DISTINCT FROM src.regulator_id
      AND c.created_at >= src.created_at - (cfg.time_window_days || ' days')::interval
      AND c.created_at <= src.created_at + (cfg.time_window_days || ' days')::interval
  LOOP
    score := 0;
    matched := '[]'::jsonb;

    IF src.email IS NOT NULL AND cand.email IS NOT NULL
       AND lower(src.email) = lower(cand.email) THEN
      score := score + cfg.weight_email;
      matched := matched || jsonb_build_object('field','email','strength','exact');
    END IF;

    IF src.licensee_id IS NOT NULL AND cand.licensee_id IS NOT NULL
       AND src.licensee_id = cand.licensee_id THEN
      score := score + cfg.weight_licensee;
      matched := matched || jsonb_build_object('field','licensee','strength','exact');
    END IF;

    IF src.subject IS NOT NULL AND cand.subject IS NOT NULL THEN
      s_subj := similarity(src.subject, cand.subject);
      IF s_subj >= 0.4 THEN
        score := score + (cfg.weight_subject_trgm * s_subj);
        matched := matched || jsonb_build_object('field','subject','strength','fuzzy','similarity',round(s_subj,2));
      END IF;
    END IF;

    IF src.description IS NOT NULL AND cand.description IS NOT NULL
       AND length(src.description) > 20 AND length(cand.description) > 20 THEN
      s_desc := similarity(src.description, cand.description);
      IF s_desc >= 0.3 THEN
        score := score + (cfg.weight_description_trgm * s_desc);
        matched := matched || jsonb_build_object('field','description','strength','fuzzy','similarity',round(s_desc,2));
      END IF;
    END IF;

    IF score < cfg.min_score THEN CONTINUE; END IF;

    lo := LEAST(src.id, cand.id);
    hi := GREATEST(src.id, cand.id);

    IF EXISTS (
      SELECT 1 FROM public.complaint_duplicate_pairs
      WHERE LEAST(primary_complaint_id, candidate_complaint_id) = lo
        AND GREATEST(primary_complaint_id, candidate_complaint_id) = hi
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.complaint_duplicate_pairs(
      primary_complaint_id, candidate_complaint_id,
      similarity_score, matched, recommendation, status, detected_at
    ) VALUES (
      lo, hi,
      LEAST(100, round(score))::integer,
      matched,
      CASE WHEN score >= 80 THEN 'merge' WHEN score >= 60 THEN 'link' ELSE 'review' END,
      'pending', now()
    )
    ON CONFLICT DO NOTHING;

    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_complaints_generate_duplicates_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_complaint_duplicate_candidates(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaints_generate_duplicates ON public.complaints;
CREATE TRIGGER trg_complaints_generate_duplicates
  AFTER INSERT OR UPDATE OF email, licensee_id, subject, description
  ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_complaints_generate_duplicates_fn();

DROP TRIGGER IF EXISTS trg_scoring_config_updated_at ON public.complaint_duplicate_scoring_config;
CREATE TRIGGER trg_scoring_config_updated_at
  BEFORE UPDATE ON public.complaint_duplicate_scoring_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
