INSERT INTO site_settings (key, value)
VALUES ('general', '{"org_name":"AFSC - Authority for Financial Services Commission","org_short_name":"AFSC","contact_email":"info@afsc.gov","contact_phone":"+1-800-555-0100","address":"123 Regulatory Avenue, Financial District, Capital City","timezone":"utc-5","date_format":"mdy","language":"en","currency":"usd","email_notifications":true,"sms_notifications":false,"maintenance_mode":false,"audit_logging":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE POLICY "Admins update site settings"
ON site_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));