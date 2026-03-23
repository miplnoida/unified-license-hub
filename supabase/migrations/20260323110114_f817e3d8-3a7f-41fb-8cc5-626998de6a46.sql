
-- Re-assign duplicate Cooperative's children to the original sector
UPDATE public.sub_sectors 
SET sector_id = 'eb61e548-71c3-4011-b81c-26624ebf870a' 
WHERE sector_id = '90bc3989-b4c7-45f0-85ff-2b96f48436c0';

UPDATE public.categories 
SET sector_id = 'eb61e548-71c3-4011-b81c-26624ebf870a' 
WHERE sector_id = '90bc3989-b4c7-45f0-85ff-2b96f48436c0';

-- Delete the duplicate sector
DELETE FROM public.sectors WHERE id = '90bc3989-b4c7-45f0-85ff-2b96f48436c0';

-- Now add unique constraints
ALTER TABLE public.sectors ADD CONSTRAINT sectors_name_unique UNIQUE (name);
ALTER TABLE public.sub_sectors ADD CONSTRAINT sub_sectors_name_sector_unique UNIQUE (sector_id, name);
ALTER TABLE public.categories ADD CONSTRAINT categories_name_sector_sub_sector_unique UNIQUE (sector_id, sub_sector_id, name);
ALTER TABLE public.services ADD CONSTRAINT services_name_sector_sub_sector_unique UNIQUE (sector_id, sub_sector_id, name);
