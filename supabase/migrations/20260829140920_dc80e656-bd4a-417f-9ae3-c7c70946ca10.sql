-- 1. Remove anonymous execute on the post-licensing matter-kind helper (F0-C A-16 defect)
REVOKE EXECUTE ON FUNCTION public.post_license_matter_kind(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_license_matter_kind(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_license_matter_kind(text) TO authenticated, service_role;

-- 2. Record explicit BUSINESS_CONFIGURATION_REQUIRED expectations for the new
--    variation / voluntary-surrender services so no configuration gap is unexplained.
INSERT INTO public.service_config_expectations (service_id, dimension, disposition, justification)
SELECT c.service_id, 'sla', 'REQUIRED',
       'Service standard for licence variation / voluntary surrender is a regulator policy decision — BUSINESS_CONFIGURATION_REQUIRED, deliberately not invented by the platform'
  FROM public.service_configuration_completeness c
 WHERE c.dimension = 'sla'
   AND NOT c.is_complete
   AND coalesce(c.justification,'') NOT ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
   AND NOT EXISTS (
     SELECT 1 FROM public.service_config_expectations e
      WHERE e.service_id = c.service_id AND e.dimension = 'sla' AND e.is_active
   );

INSERT INTO public.service_config_expectations (service_id, dimension, disposition, justification)
SELECT c.service_id, 'fee', 'REQUIRED',
       'Fee for licence variation / voluntary surrender is a regulator policy decision — BUSINESS_CONFIGURATION_REQUIRED, deliberately not invented by the platform'
  FROM public.service_configuration_completeness c
 WHERE c.dimension = 'fee'
   AND NOT c.is_complete
   AND coalesce(c.justification,'') NOT ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
   AND NOT EXISTS (
     SELECT 1 FROM public.service_config_expectations e
      WHERE e.service_id = c.service_id AND e.dimension = 'fee' AND e.is_active
   );