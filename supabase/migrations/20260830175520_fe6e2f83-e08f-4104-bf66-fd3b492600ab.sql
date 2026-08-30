-- F8A-B4 certification remediation: close B4-introduced grant findings.

-- 1. Internal helpers must not be reachable without a session.
REVOKE ALL ON FUNCTION public.address_require(text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.address_usage_visible(uuid, text, uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.address_master_data_iso2(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.address_master_data_label(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.address_normalize_key(text, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.address_norm_street(text) FROM anon, PUBLIC;

-- 2. Signed-in users are read-only on the canonical register; every mutation is
--    performed by the governed SECURITY DEFINER RPCs, so TRUNCATE/TRIGGER/REFERENCES
--    are unnecessary browser-side capabilities.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.addresses FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.address_usages FROM authenticated;
REVOKE ALL ON TABLE public.addresses FROM anon;
REVOKE ALL ON TABLE public.address_usages FROM anon;

GRANT SELECT ON TABLE public.addresses TO authenticated;
GRANT SELECT ON TABLE public.address_usages TO authenticated;
GRANT ALL ON TABLE public.addresses TO service_role;
GRANT ALL ON TABLE public.address_usages TO service_role;