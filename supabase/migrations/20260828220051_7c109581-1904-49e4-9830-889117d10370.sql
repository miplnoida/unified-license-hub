CREATE OR REPLACE FUNCTION public.regulated_establishment_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
      DETAIL = TG_TABLE_NAME || ' is a permanent regulatory register';
  END IF;
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') <> 'trusted' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = TG_TABLE_NAME || ' is writable only through governed post-licensing effect execution';
  END IF;
  IF TG_TABLE_NAME = 'regulated_establishment_events' AND TG_OP = 'UPDATE' THEN
    -- the only permitted mutation is the one-time stamping of the effect ledger reference
    IF OLD.effect_id IS NOT NULL OR NEW.effect_id IS NULL
       OR NEW.id <> OLD.id OR NEW.establishment_id <> OLD.establishment_id
       OR NEW.event_type <> OLD.event_type
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
        DETAIL = 'establishment lifecycle events are append-only';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'regulated_establishments' THEN
    IF NEW.id <> OLD.id OR NEW.entity_id <> OLD.entity_id
       OR NEW.establishment_reference <> OLD.establishment_reference
       OR NEW.source_application_id IS DISTINCT FROM OLD.source_application_id
       OR NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
      RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
        DETAIL = 'establishment identity and opening history cannot be rewritten';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $fn$;