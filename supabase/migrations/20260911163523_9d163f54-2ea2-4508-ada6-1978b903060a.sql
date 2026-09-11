-- PCOMP-R2D (6): the deadline record is read-only for every client role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.supervisory_response_sla_obligation FROM authenticated, anon;
REVOKE ALL ON public.supervisory_response_sla_obligation FROM anon;
GRANT SELECT ON public.supervisory_response_sla_obligation TO authenticated;
GRANT ALL ON public.supervisory_response_sla_obligation TO service_role;