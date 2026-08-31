CREATE OR REPLACE FUNCTION public.tg_group_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_group uuid;
  v_before jsonb := NULL;
  v_after jsonb := NULL;
  v_reason text := NULL;
  v_ca public.compliance_audit_action := 'UPDATE';
BEGIN
  IF TG_OP = 'DELETE' THEN v_before := to_jsonb(OLD); ELSE v_after := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN v_before := to_jsonb(OLD); END IF;
  IF TG_OP = 'INSERT' THEN v_ca := 'CREATE'; ELSIF TG_OP = 'DELETE' THEN v_ca := 'DELETE'; END IF;

  IF TG_TABLE_NAME = 'financial_groups' THEN
    v_group := COALESCE(v_after->>'id', v_before->>'id')::uuid;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'GROUP_CREATED' ELSE 'GROUP_MASTER_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'financial_group_members' THEN
    v_group := COALESCE(v_after->>'group_id', v_before->>'group_id')::uuid;
    v_reason := COALESCE(v_after->>'exclusion_rationale', v_after->>'ownership_variance_note');
    v_action := CASE TG_OP
      WHEN 'INSERT' THEN 'GROUP_MEMBER_ADDED'
      WHEN 'DELETE' THEN 'GROUP_MEMBER_REMOVED'
      ELSE 'GROUP_MEMBER_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'group_consolidation_methods' THEN
    v_group := COALESCE(v_after->>'group_id', v_before->>'group_id')::uuid;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'GROUP_METHODOLOGY_VERSION_CREATED' ELSE 'GROUP_METHODOLOGY_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'intragroup_exposures' THEN
    v_group := COALESCE(v_after->>'group_id', v_before->>'group_id')::uuid;
    v_action := CASE TG_OP
      WHEN 'INSERT' THEN 'INTRAGROUP_EXPOSURE_RECORDED'
      WHEN 'DELETE' THEN 'INTRAGROUP_EXPOSURE_DELETED'
      ELSE 'INTRAGROUP_EXPOSURE_UPDATED' END;
  ELSIF TG_TABLE_NAME = 'group_ewi_alerts' THEN
    v_group := COALESCE(v_after->>'group_id', v_before->>'group_id')::uuid;
    IF TG_OP = 'UPDATE' AND (v_before->>'status') = (v_after->>'status') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_action := CASE WHEN TG_OP = 'UPDATE' AND (v_after->>'status') = 'acknowledged'
                     THEN 'GROUP_EWI_ACKNOWLEDGED' ELSE 'GROUP_EWI_STATUS_CHANGED' END;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.prudential_audit_event(
    v_action, 'financial_group', v_group, v_before, v_after,
    jsonb_build_object('surface', TG_TABLE_NAME, 'operation', TG_OP),
    v_reason, v_ca);

  RETURN COALESCE(NEW, OLD);
END; $$;