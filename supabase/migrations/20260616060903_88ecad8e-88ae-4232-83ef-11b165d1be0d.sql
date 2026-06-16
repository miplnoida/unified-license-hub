UPDATE public.notification_templates
SET body = REPLACE(body, '{{portal_url}}/register', '{{portal_url}}/registration/portal')
WHERE body LIKE '%{{portal_url}}/register%';