-- Scope resolution convergence: derive data scope from the canonical sec_*
-- catalogue (the same authority as has_permission), falling back to the legacy
-- roles tables only when the caller holds no canonical qualifying role.
CREATE OR REPLACE FUNCTION public.user_scope_for(_user_id uuid, _module text, _action text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_all boolean := false;
  sectors_agg text[] := '{}';
  licensees_agg text[] := '{}';
  has_assigned boolean := false;
  has_own boolean := false;
  qualified boolean := false;
  rec record; sc jsonb; s text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('scope','none','source','anonymous');
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN jsonb_build_object('scope','all','source','super_admin');
  END IF;

  -- 1. Canonical catalogue.
  FOR rec IN
    SELECT r.id AS role_id,
           COALESCE(st.key, 'all') AS scope_key,
           rs.id AS role_scope_id
    FROM public.sec_user_roles ur
    JOIN public.sec_roles r ON r.id = ur.role_id
    JOIN public.sec_role_permissions rp ON rp.role_id = r.id
    JOIN public.sec_permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.id = p.module_id
    LEFT JOIN public.sec_role_scopes rs ON rs.role_id = r.id AND rs.module_id = m.id
    LEFT JOIN public.sec_scope_types st ON st.id = rs.scope_type_id
    WHERE ur.user_id = _user_id
      AND COALESCE(ur.status,'active') = 'active'
      AND (ur.effective_from IS NULL OR ur.effective_from <= now())
      AND (ur.effective_until IS NULL OR ur.effective_until >= now())
      AND COALESCE(r.is_active, true)
      AND lower(m.key) = lower(_module)
      AND lower(p.key) = lower(_action)
  LOOP
    qualified := true;
    s := rec.scope_key;
    IF s = 'all' THEN has_all := true;
    ELSIF s = 'sector' THEN
      sectors_agg := sectors_agg || COALESCE(ARRAY(
        SELECT COALESCE(v.value_id::text, v.value_text)
        FROM public.sec_role_scope_values v
        WHERE v.role_scope_id = rec.role_scope_id), '{}');
    ELSIF s = 'institution' THEN
      licensees_agg := licensees_agg || COALESCE(ARRAY(
        SELECT COALESCE(v.value_id::text, v.value_text)
        FROM public.sec_role_scope_values v
        WHERE v.role_scope_id = rec.role_scope_id), '{}');
    ELSIF s = 'assigned' THEN has_assigned := true;
    ELSIF s = 'own' THEN has_own := true;
    END IF;
  END LOOP;

  -- 2. Legacy fallback (pre-sec_* role model) only when nothing canonical matched.
  IF NOT qualified THEN
    FOR rec IN
      SELECT r.id, r.scope_config
      FROM public.user_dynamic_roles udr
      JOIN public.roles r ON r.id = udr.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE udr.user_id = _user_id
        AND COALESCE(r.status,'active') = 'active'
        AND lower(regexp_replace(p.module,'\s+','_','g')) = lower(_module)
        AND lower(p.name) = lower(_action)
      GROUP BY r.id, r.scope_config
    LOOP
      qualified := true;
      sc := rec.scope_config -> _module;
      IF sc IS NULL THEN has_all := true; CONTINUE; END IF;
      s := COALESCE(sc ->> 'scope', 'all');
      IF s = 'all' THEN has_all := true;
      ELSIF s = 'sector' THEN
        sectors_agg := sectors_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'sectors')), '{}');
      ELSIF s = 'institution' THEN
        licensees_agg := licensees_agg || COALESCE(ARRAY(SELECT jsonb_array_elements_text(sc -> 'licensees')), '{}');
      ELSIF s = 'assigned' THEN has_assigned := true;
      ELSIF s = 'own' THEN has_own := true;
      END IF;
    END LOOP;
  END IF;

  IF NOT qualified THEN RETURN jsonb_build_object('scope','none','source','no_qualifying_role'); END IF;
  IF has_all THEN RETURN jsonb_build_object('scope','all','source','role_grant'); END IF;
  IF array_length(sectors_agg,1) > 0 THEN
    RETURN jsonb_build_object('scope','sector',
      'sectors', to_jsonb(ARRAY(SELECT DISTINCT unnest(sectors_agg))), 'source','role_grant');
  END IF;
  IF array_length(licensees_agg,1) > 0 THEN
    RETURN jsonb_build_object('scope','institution',
      'licensees', to_jsonb(ARRAY(SELECT DISTINCT unnest(licensees_agg))), 'source','role_grant');
  END IF;
  IF has_assigned THEN RETURN jsonb_build_object('scope','assigned','source','role_grant'); END IF;
  IF has_own THEN RETURN jsonb_build_object('scope','own','source','role_grant'); END IF;
  RETURN jsonb_build_object('scope','none','source','unbacked_scope_only');
END;
$function$;