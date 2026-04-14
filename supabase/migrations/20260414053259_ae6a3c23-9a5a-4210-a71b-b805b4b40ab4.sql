
-- Add group_id column to fee_configurations
ALTER TABLE public.fee_configurations
ADD COLUMN group_id uuid DEFAULT gen_random_uuid();

-- Backfill existing rows: each row becomes its own group
UPDATE public.fee_configurations SET group_id = id WHERE group_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.fee_configurations ALTER COLUMN group_id SET NOT NULL;

-- Index for fast grouping queries
CREATE INDEX idx_fee_configurations_group_id ON public.fee_configurations (group_id);
