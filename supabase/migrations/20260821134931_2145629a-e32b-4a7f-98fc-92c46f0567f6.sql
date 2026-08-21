insert into public.application_fp_links (application_id, assessment_id, role_note, is_required)
values
  ('5f3128bc-e223-49e8-8e36-9e3b0cf5cee7','8586464d-7f17-4589-8bf5-12ea374df120','Proposed Director', true),
  ('56c391ce-447f-4605-8f67-5f05d24a2268','8586464d-7f17-4589-8bf5-12ea374df120','Proposed Director (EPR-05 explicit-linkage control)', true)
on conflict (application_id, assessment_id) do nothing;