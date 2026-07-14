-- Collaborative Review: widen approval-block trigger to also catch 'escalate'
-- (both approve and escalate move the workflow forward and must be blocked
-- when unresolved blocking review comments exist on the current step).

CREATE OR REPLACE FUNCTION public.enforce_review_approval_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _et text; _res jsonb;
BEGIN
  IF NEW.action_type IS NULL OR NEW.action_type NOT IN ('approve','escalate') THEN
    RETURN NEW;
  END IF;
  IF NEW.entity_type IS NULL OR NEW.entity_id IS NULL OR NEW.step_id IS NULL THEN
    RETURN NEW;
  END IF;
  _et := CASE WHEN NEW.entity_type = 'pre_application' THEN 'application' ELSE NEW.entity_type END;
  _res := public.check_approval_blocked(_et, NEW.entity_id, NEW.step_id);
  IF (_res->>'blocked')::boolean THEN
    RAISE EXCEPTION 'REVIEW_BLOCKED:%', (_res->>'count')::int USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

-- Trigger definition is unchanged; the function body drives the behaviour.
