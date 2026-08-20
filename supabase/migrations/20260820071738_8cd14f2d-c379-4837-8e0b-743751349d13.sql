REVOKE ALL ON FUNCTION public.entity_identity_snapshot_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_identity_snapshot_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.entity_identity_snapshot_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.normalize_entity_identifier(uuid, text) FROM anon;