UPDATE public.notification_templates
SET body = REPLACE(
  body,
  '{{portal_url}}/registration/portal',
  '{{portal_url}}/registration/portal?registration={{registration_id}}'
)
WHERE body LIKE '%{{portal_url}}/registration/portal%'
  AND body NOT LIKE '%/registration/portal?registration=%';