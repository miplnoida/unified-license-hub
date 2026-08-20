insert into public.conduct_monitoring_rules
  (name, code, description, scope, rule_type, definition, frequency, risk_delta, active, metric,
   source_dataset, threshold_value, comparison_operator, lookback_days, current_version)
select
  'A3-C1 Mis-selling cluster (Motor Insurance)',
  'A3-C1-MISSELL-MOTOR',
  'Detects 4 or more Mis-selling complaints about Motor Insurance for the same entity within a rolling 30-day window.',
  'entity_product',
  'complaint_volume',
  jsonb_build_object(
    'window_days', 30,
    'threshold', 4,
    'complaint_type_id', 'f8496ba0-9c66-4414-ab35-afd728598cb5',
    'product_id', '012d891c-276c-4f04-8a07-93b5f81ae49c',
    'group_by_product', true,
    'licensee_ids', jsonb_build_array('da99c6e6-b8a0-4d6c-8c20-da5caa62480e','4de6725a-7b44-4316-876a-d3cf8d49ca87')
  ),
  'on_demand', 12, true, 'complaint_count',
  'complaints', 4, '>=', 30, 1
where not exists (select 1 from public.conduct_monitoring_rules where code = 'A3-C1-MISSELL-MOTOR');

insert into public.complaints
  (complaint_number, subject, description, licensee_id, license_holder_id, complaint_type_id, product_id,
   severity, priority, status, intake_source, customer_type, created_at)
select 'A3-C1-' || lpad(g::text, 3, '0'),
       'Motor policy sold without disclosure of excess terms',
       'Complainant states the motor insurance policy was sold without disclosing the applicable excess and exclusions.',
       'da99c6e6-b8a0-4d6c-8c20-da5caa62480e', 'da99c6e6-b8a0-4d6c-8c20-da5caa62480e',
       'f8496ba0-9c66-4414-ab35-afd728598cb5', '012d891c-276c-4f04-8a07-93b5f81ae49c',
       'medium', 'p3', 'submitted', 'public_portal', 'retail', now() - (g || ' days')::interval
from generate_series(1, 4) g
where not exists (select 1 from public.complaints where complaint_number like 'A3-C1-0%');

insert into public.complaints
  (complaint_number, subject, description, licensee_id, license_holder_id, complaint_type_id, product_id,
   severity, priority, status, intake_source, customer_type, created_at)
select 'A3-C1N-' || lpad(g::text, 3, '0'),
       'Motor add-on cover not explained at point of sale',
       'Complainant states the add-on cover was not explained when the motor policy was arranged.',
       '4de6725a-7b44-4316-876a-d3cf8d49ca87', '4de6725a-7b44-4316-876a-d3cf8d49ca87',
       'f8496ba0-9c66-4414-ab35-afd728598cb5', '012d891c-276c-4f04-8a07-93b5f81ae49c',
       'low', 'p4', 'submitted', 'public_portal', 'retail', now() - (g || ' days')::interval
from generate_series(1, 2) g
where not exists (select 1 from public.complaints where complaint_number like 'A3-C1N-%');