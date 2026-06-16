UPDATE public.notification_templates
SET body = REPLACE(body, '{{portal_url}}/registration/portal?registration={{registration_id}}', '{{portal_url}}/update-registration-form?registration={{registration_id}}')
WHERE body LIKE '%{{portal_url}}/registration/portal?registration={{registration_id}}%';

UPDATE public.notification_templates
SET body = REPLACE(body, '{{portal_url}}/registration/portal', '{{portal_url}}/update-registration-form')
WHERE body LIKE '%{{portal_url}}/registration/portal%';

UPDATE public.notification_templates
SET body = REPLACE(body, '{{portal_url}}/register', '{{portal_url}}/update-registration-form?registration={{registration_id}}')
WHERE event_type LIKE 'registration.%'
  AND body LIKE '%{{portal_url}}/register%';

UPDATE public.notification_templates
SET body = REPLACE(body, 'Portal: {{portal_url}}', 'Portal: {{portal_url}}/update-registration-form?registration={{registration_id}}')
WHERE event_type IN ('registration.resubmission_requested', 'registration.returned_for_correction', 'registration.more_info_requested')
  AND body LIKE '%Portal: {{portal_url}}%'
  AND body NOT LIKE '%/update-registration-form%';