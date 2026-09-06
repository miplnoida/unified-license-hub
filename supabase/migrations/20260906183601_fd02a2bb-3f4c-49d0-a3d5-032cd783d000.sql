REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_intelligence_overview(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_theme_register(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_theme_detail(text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_change_lens(text, integer, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_group_intelligence(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_cross_domain(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_peer_view(date, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) FROM PUBLIC, anon;

REVOKE SELECT ON public.supervisory_portfolio_condition FROM anon;
REVOKE SELECT ON public.supervisory_portfolio_entity FROM anon;