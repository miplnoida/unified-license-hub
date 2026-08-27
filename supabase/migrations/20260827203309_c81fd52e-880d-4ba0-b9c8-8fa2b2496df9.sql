-- Schema hygiene: two overloads of get_application_list_page differing only by a
-- trailing defaulted argument made every named/positional call ambiguous.
-- Keep the superset (with _status_group) and drop the legacy 11-argument variant.
DROP FUNCTION IF EXISTS public.get_application_list_page(
  integer, integer, text, text, text, uuid, text, text, uuid, uuid, text
);