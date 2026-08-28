INSERT INTO public.config_governed_tables (
  table_name, domain, required_module_key, required_create_action, required_edit_action,
  soft_delete_column, soft_delete_retired_value, allow_hard_delete, immutable_columns, notes
) VALUES (
  'return_config_forms', 'returns', 'returns_management', 'create', 'edit',
  NULL, NULL, true, ARRAY['id','created_at','created_by'], 'Return configuration form assignments'
)
ON CONFLICT (table_name) DO UPDATE
  SET domain = EXCLUDED.domain,
      required_module_key = EXCLUDED.required_module_key,
      required_create_action = EXCLUDED.required_create_action,
      required_edit_action = EXCLUDED.required_edit_action,
      allow_hard_delete = EXCLUDED.allow_hard_delete,
      notes = EXCLUDED.notes,
      updated_at = now();