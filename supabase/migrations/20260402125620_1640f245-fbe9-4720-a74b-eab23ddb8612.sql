-- Add return_template_id column to return_configurations
ALTER TABLE return_configurations ADD COLUMN IF NOT EXISTS return_template_id uuid REFERENCES return_templates(id);

-- Link quarterly config to the Quarter forms return template, remove single form link
UPDATE return_configurations 
SET return_template_id = '4d9ccab8-3766-4f85-b0be-ab33c7b64893',
    form_id = NULL
WHERE id = '4b9686a4-ee4d-4038-a49c-b3d0432b621e';

-- Link annual config to the annual-1 return template
UPDATE return_configurations 
SET return_template_id = 'b00ad4c7-6549-4f32-9a82-31052173cbc6'
WHERE id = '1a8e9f9f-6bfa-40cd-afe8-73d2bea98eed';

-- Publish all draft quarterly form versions
UPDATE form_versions SET status = 'published', published_at = now()
WHERE id IN (
  '6f973f96-fe46-4971-8d50-83d0ea89854f',
  '2335e201-7c46-4b77-8fd2-54dacd22d0c8',
  '3bb04894-7ca0-4a6d-852e-07ee4245795e',
  '9c0f4a00-3055-44f5-a522-7949d79ec5fb',
  'f1d8c459-c1af-47a9-bd4e-716a4b20e4ef',
  '4aaee08a-2765-46e3-bf60-ff937624fe6b',
  'd136d4f2-aac8-4feb-ad0e-bdc1bb68da47',
  '107f30c7-ccf4-4fde-a463-982542c992cb',
  '215897ce-8a19-4e9f-ab07-45e9b11c9fc2',
  'eae10369-bfae-4a90-8e2b-fb8e84cbc5f4',
  '28338c02-c3f9-484f-bdce-40ca47fb01d5',
  '44a5aa76-aaa3-4c3e-88a2-9be7ad055476',
  '4e779571-f844-4edc-8754-1d87f13a1d37',
  '700c3ea3-0c31-44d7-8333-3c81e93b27c4',
  '782cdb37-e7eb-44e8-b30a-4af0cefc1794',
  'de7e1340-d341-4e07-8ace-6aab9120e2ac'
);

-- Also publish the quarterly form templates themselves
UPDATE form_templates SET status = 'published'
WHERE return_template_id = '4d9ccab8-3766-4f85-b0be-ab33c7b64893' AND status != 'published';