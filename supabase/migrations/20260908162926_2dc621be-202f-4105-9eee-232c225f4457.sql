CREATE OR REPLACE FUNCTION public.supervisory_methodology_regulator_scope_readable(_domain_code text, _regulator_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _mod text; _perm text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;              -- platform administration
  IF public.supervisory_methodology_oversight_reader(_uid) THEN RETURN true; END IF;  -- enterprise oversight

  SELECT split_part(manage_config_permission,'.',1), methodology_approval_permission
    INTO _mod, _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _domain_code;

  -- Domain-neutral content (MIPL reference packages and reference methodology
  -- versions) belongs to no regulator, so regulator scope cannot qualify it.
  -- It stays visible to holders of the domain's view right; it is never
  -- regulator policy and carries no regulator approval.
  IF _regulator_id IS NULL THEN
    RETURN _mod IS NOT NULL AND public.has_permission(_uid, _mod, 'view');
  END IF;

  IF _mod IS NOT NULL AND public.user_has_regulator_authority(_uid, _mod, 'view', _regulator_id) THEN
    RETURN true; END IF;
  IF _perm IS NOT NULL AND public.user_has_regulator_authority(
       _uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _regulator_id) THEN
    RETURN true; END IF;

  RETURN false;
END $$;