-- Prevent duplicate workflow instances per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_workflow_per_entity 
ON public.workflow_instances (entity_id, entity_type) 
WHERE status IN ('active', 'paused');

-- Add unique constraint for form_responses per entity to fix upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_form_response_per_entity 
ON public.form_responses (entity_id, entity_type, template_id) 
WHERE entity_id IS NOT NULL;