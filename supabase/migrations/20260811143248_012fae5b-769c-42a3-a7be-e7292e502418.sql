ALTER TYPE public.escalation_type ADD VALUE IF NOT EXISTS 'prudential_breach';
ALTER TYPE public.escalation_type ADD VALUE IF NOT EXISTS 'complaint_escalation';
ALTER TYPE public.escalation_type ADD VALUE IF NOT EXISTS 'conduct_alert';
ALTER TYPE public.escalation_type ADD VALUE IF NOT EXISTS 'coordination_escalation';