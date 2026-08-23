CREATE INDEX IF NOT EXISTS idx_pru_ewi_alerts_status_entity ON public.prudential_ewi_alerts (status, entity_id);
CREATE INDEX IF NOT EXISTS idx_pru_actions_status_entity ON public.prudential_actions (status, entity_id);
CREATE INDEX IF NOT EXISTS idx_pru_escalations_status_entity ON public.prudential_escalations (status, entity_id);
CREATE INDEX IF NOT EXISTS idx_pru_assessments_status_entity ON public.prudential_assessments (status, entity_id);