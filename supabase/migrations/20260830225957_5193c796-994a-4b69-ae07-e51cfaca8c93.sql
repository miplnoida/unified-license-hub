-- F8-W1A: retire the duplicate calculated-ratio store.
-- Canonical calculated-ratio source is public.return_metric_values
-- (source_kind = 'CALCULATED', keyed by return_filing_version_id +
-- regulatory_metric_id), written by public.returns_calculate_metrics and read
-- by public._prudential_canonical_detect_run for threshold evaluation and
-- breach detection.

-- 1. Remove the only writers into the retired store (both overloads).
DROP FUNCTION IF EXISTS public.record_return_ratio(uuid, text, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.record_return_ratio(uuid, text, text, numeric, text, uuid, text, integer, text);

-- 2. Hard-freeze the retired store as read-only compatibility history.
CREATE OR REPLACE FUNCTION public.tg_rcr_retired_no_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'return_calculated_ratios is retired and read-only; calculated ratios are stored in return_metric_values (source_kind = ''CALCULATED'')'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS tg_rcr_retired_no_insert ON public.return_calculated_ratios;
CREATE TRIGGER tg_rcr_retired_no_insert
  BEFORE INSERT OR DELETE ON public.return_calculated_ratios
  FOR EACH ROW EXECUTE FUNCTION public.tg_rcr_retired_no_write();

COMMENT ON TABLE public.return_calculated_ratios IS
  'RETIRED (F8-W1A, GAP-F8-09). Read-only historical compatibility store. Canonical calculated ratios live in public.return_metric_values (source_kind = ''CALCULATED''), written by returns_calculate_metrics and read by _prudential_canonical_detect_run for threshold evaluation and breach detection. New writes are rejected.';
