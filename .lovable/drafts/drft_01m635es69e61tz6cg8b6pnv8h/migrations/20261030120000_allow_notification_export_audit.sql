-- Allow Notification Centre CSV export audit entries (notification_export logs NOTIFICATION_EXPORTED).
CREATE OR REPLACE FUNCTION public.log_notification_audit(_action text, _notification_ids uuid[], _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ids uuid[] := COALESCE(array_remove(_notification_ids, NULL), ARRAY[]::uuid[]);
BEGIN
  IF _action NOT IN (
    'NOTIFICATION_CREATED','NOTIFICATION_SENT','NOTIFICATION_DELIVERY_FAILED','NOTIFICATION_READ',
    'NOTIFICATIONS_BULK_MARKED_READ','NOTIFICATION_DISMISSED','NOTIFICATION_ACTIONED','NOTIFICATION_ARCHIVED',
    'NOTIFICATION_FORWARDED','NOTIFICATION_PREFERENCES_UPDATED','NOTIFICATION_RETRIED','NOTIFICATION_RESENT_BY_ADMIN','NOTIFICATION_EXPORTED'
  ) THEN
    RAISE EXCEPTION 'unsupported_notification_audit_action: %', _action;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, new_value)
  VALUES (
    auth.uid(),
    _action,
    'notification',
    CASE WHEN array_length(ids,1) = 1 THEN ids[1]::text ELSE NULL END,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object('count', COALESCE(array_length(ids,1),0)),
    jsonb_build_object('notification_ids', to_jsonb(ids))
  );
END $function$

;
