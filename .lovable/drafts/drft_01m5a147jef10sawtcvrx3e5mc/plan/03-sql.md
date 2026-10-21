## Services and forms

| Code | Service | Type (provisional) | Workflow | F&P | SLA |
|---|---|---|---|---|---|
| CU-PL-02 | Change of Registered Address | Approval | Standard | no | 30 |
| CU-PL-03 | Change of Business or Contact Details | Notification | Notification | no | 10 |
| CU-PL-04 | Appointment of Director | Approval | Fit & Proper | yes | 45 |
| CU-PL-05 | Resignation or Removal of Director | Notification | Notification | no | 10 |
| CU-PL-06 | Appointment or Change of Senior Management | Approval | Fit & Proper | yes | 45 |
| CU-PL-07 | Change of Compliance Officer / MLRO | Approval | Fit & Proper | yes | 45 |
| CU-PL-08 | Amendment of Bye-Laws | Approval | Standard | no | 30 |
| CU-PL-09 | Change of Credit Union Name | Approval | Standard | no | 30 |
| CU-PL-10 | Change in Authorized Activities | Approval | Enhanced | no | 60 |
| CU-PL-11 | Opening or Relocation of Branch | Approval | Standard | no | 30 |
| CU-PL-12 | Closure of Branch | Approval | Standard | no | 30 |
| CU-PL-13 | Merger or Amalgamation | Approval | Enhanced | no | 90 |
| CU-PL-14 | Voluntary Surrender of Licence | Approval | Enhanced | no | 60 |
| CU-PL-15 | Variation of Licence Conditions | Approval | Enhanced | no | 45 |
| CU-PL-16 | Change in Governance Structure | Approval | Enhanced | no | 60 |

Every form has the same five sections:
1. Licence & Credit Union (4 fields)
2. Request Details (3 fields)
3. Service Details (the service-specific fields)
4. Supporting Documents (file fields: PDF/JPG/PNG, up to 20 MB)
5. Declaration (5 fields)

## Proposed SQL (nothing runs until you approve)

### 1. Before-snapshot (read-only)
Stop if any number differs from these: services 152, form_templates 213, form_versions 228, form_fields 8,696, fee_configurations 144, approval_workflows 16, applications 49, existing CU-PL codes 0.

```sql
SELECT (SELECT count(*) FROM public.services) services,
       (SELECT count(*) FROM public.form_templates) templates,
       (SELECT count(*) FROM public.form_versions) versions,
       (SELECT count(*) FROM public.form_fields) fields,
       (SELECT count(*) FROM public.fee_configurations) fees,
       (SELECT count(*) FROM public.approval_workflows) workflows,
       (SELECT count(*) FROM public.applications) applications,
       (SELECT count(*) FROM public.services WHERE code LIKE 'CU-PL-%') existing_cu_pl;
```

### 2. Insert (one transaction, inserts only, new IDs from `gen_random_uuid()` defaults)

```sql
BEGIN;

CREATE TEMP TABLE cu_spec (
  code text PRIMARY KEY, name text, workflow_id uuid, fp boolean, sla int,
  decision text, fields jsonb, docs jsonb
) ON COMMIT DROP;

INSERT INTO cu_spec VALUES
('CU-PL-02','Change of Registered Address','7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',false,30,'approval',
 '[["new_address_line","New Address","text",true],["new_parish","Parish / District","text",true],["current_address","Current Address","text",true]]',
 '[["proof_of_address","Proof of New Address",true],["board_resolution","Board Resolution",true]]'),
('CU-PL-03','Change of Business or Contact Details','d2590edc-fa3a-421b-866d-905ebfee40d6',false,10,'notification',
 '[["detail_type","Detail Being Changed","select",true,["Business Address","Phone","Email","Website","Other"]],["current_value","Current Value","text",true],["new_value","New Value","text",true]]',
 '[["supporting_evidence","Supporting Evidence",false]]'),
('CU-PL-04','Appointment of Director','24d71346-6214-49ed-8250-1cf09b9a7492',true,45,'approval',
 '[["director_full_name","Director Full Name","text",true],["director_nationality","Nationality","text",true],["director_dob","Date of Birth","date",true],["director_id_number","ID / Passport Number","text",true]]',
 '[["cv","Curriculum Vitae",true],["fit_and_proper_questionnaire","Fit and Proper Questionnaire",true],["police_certificate","Police Certificate",true],["board_resolution","Board Resolution",true]]'),
('CU-PL-05','Resignation or Removal of Director','d2590edc-fa3a-421b-866d-905ebfee40d6',false,10,'notification',
 '[["director_full_name","Director Full Name","text",true],["departure_type","Type","select",true,["Resignation","Removal"]],["departure_reason","Reason","textarea",true]]',
 '[["resignation_or_removal_letter","Resignation / Removal Letter",true],["board_minutes","Board Minutes",false]]'),
('CU-PL-06','Appointment or Change of Senior Management','24d71346-6214-49ed-8250-1cf09b9a7492',true,45,'approval',
 '[["person_full_name","Full Name","text",true],["position_title","Position","text",true],["appointment_type","Appointment Type","select",true,["New","Replacement"]]]',
 '[["cv","Curriculum Vitae",true],["fit_and_proper_questionnaire","Fit and Proper Questionnaire",true],["police_certificate","Police Certificate",true]]'),
('CU-PL-07','Change of Compliance Officer / MLRO','24d71346-6214-49ed-8250-1cf09b9a7492',true,45,'approval',
 '[["role_type","Role","select",true,["Compliance Officer","MLRO","Both"]],["person_full_name","Incoming Person Full Name","text",true],["outgoing_person_name","Outgoing Person Name","text",false]]',
 '[["cv","Curriculum Vitae",true],["fit_and_proper_questionnaire","Fit and Proper Questionnaire",true],["aml_training_certificate","AML Training Certificate",true]]'),
('CU-PL-08','Amendment of Bye-Laws','7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',false,30,'approval',
 '[["byelaw_clause_reference","Clause Reference","text",true],["current_clause_text","Current Clause Text","textarea",true],["proposed_clause_text","Proposed Clause Text","textarea",true],["agm_resolution_date","AGM / SGM Resolution Date","date",true]]',
 '[["amended_byelaws","Amended Bye-Laws",true],["agm_resolution","AGM / SGM Resolution",true]]'),
('CU-PL-09','Change of Credit Union Name','7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',false,30,'approval',
 '[["current_name","Current Name","text",true],["proposed_name","Proposed Name","text",true]]',
 '[["name_reservation_or_registrar_approval","Name Reservation / Registrar Approval",true],["board_resolution","Board Resolution",true]]'),
('CU-PL-10','Change in Authorized Activities','2b5fdc86-bf8a-4c96-9620-54585f5332e7',false,60,'approval',
 '[["current_activities","Current Authorized Activities","textarea",true],["proposed_activities","Proposed Activities","textarea",true],["business_plan_summary","Business Plan Summary","textarea",true],["capital_impact","Capital Impact","textarea",true],["risk_aml_assessment","Risk and AML Assessment","textarea",true],["systems_readiness","Systems and Controls Readiness","textarea",true]]',
 '[["business_plan","Business Plan",true],["board_resolution","Board Resolution",true],["risk_aml_assessment_doc","Risk / AML Assessment",true],["financial_projections","Financial Projections",true]]'),
('CU-PL-11','Opening or Relocation of Branch','7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',false,30,'approval',
 '[["branch_action","Action","select",true,["Opening","Relocation"]],["branch_name","Branch Name","text",true],["branch_address","Branch Address","text",true],["previous_address","Previous Address (relocation)","text",false]]',
 '[["premises_evidence","Premises Lease / Ownership",true],["security_assessment","Security Assessment",false],["board_resolution","Board Resolution",true]]'),
('CU-PL-12','Closure of Branch','7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',false,30,'approval',
 '[["branch_name","Branch Name","text",true],["branch_address","Branch Address","text",true],["member_notification_plan","Member Notification Plan","textarea",true]]',
 '[["member_notice","Member Notice",true],["board_resolution","Board Resolution",true]]'),
('CU-PL-13','Merger or Amalgamation','2b5fdc86-bf8a-4c96-9620-54585f5332e7',false,90,'approval',
 '[["counterparty_name","Counterparty Credit Union","text",true],["transaction_type","Transaction Type","select",true,["Merger","Amalgamation","Transfer of Engagements"]],["member_vote_date","Member Vote Date","date",true],["transaction_summary","Transaction Summary","textarea",true]]',
 '[["merger_agreement","Merger / Amalgamation Agreement",true],["member_resolution","Member Resolution",true],["financial_statements","Financial Statements",true]]'),
('CU-PL-14','Voluntary Surrender of Licence','2b5fdc86-bf8a-4c96-9620-54585f5332e7',false,60,'approval',
 '[["surrender_reason","Reason for Surrender","textarea",true],["member_funds_plan","Plan for Member Funds","textarea",true],["last_operating_date","Last Operating Date","date",true]]',
 '[["board_resolution","Board Resolution",true],["member_resolution","Member Resolution",true],["wind_down_plan","Wind-Down Plan",true]]'),
('CU-PL-15','Variation of Licence Conditions','2b5fdc86-bf8a-4c96-9620-54585f5332e7',false,45,'approval',
 '[["condition_reference","Condition Reference","text",true],["current_condition_wording","Current Condition Wording","textarea",true],["proposed_condition_wording","Proposed Wording","textarea",true],["justification","Justification","textarea",true]]',
 '[["compliance_evidence","Supporting Compliance Evidence",true],["board_resolution","Board Resolution",false]]'),
('CU-PL-16','Change in Governance Structure','2b5fdc86-bf8a-4c96-9620-54585f5332e7',false,60,'approval',
 '[["current_structure","Current Governance Structure","textarea",true],["proposed_structure","Proposed Governance Structure","textarea",true],["committees_affected","Committees Affected","textarea",false]]',
 '[["revised_governance_chart","Revised Governance Chart",true],["board_resolution","Board Resolution",true]]');

-- Services (15, INACTIVE)
INSERT INTO public.services
  (sector_id, sub_sector_id, regulator_id, name, code, description, status,
   lifecycle_stage, workflow_id, decision_type, requires_fit_and_proper, sla_days, document_checklist)
SELECT '17a9fbec-5377-4f3d-a7b8-e2c357966d23', 'fb630e15-a4a6-43d8-b002-ade1039f9edc',
       '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3', s.name, s.code,
       'CU-POSTLIC-2026-10 — provisional, pending regulatory confirmation', 'inactive',
       'post_license', s.workflow_id, s.decision, s.fp, s.sla,
       (SELECT jsonb_agg(d->>1) FROM jsonb_array_elements(s.docs) d)
FROM cu_spec s
WHERE NOT EXISTS (SELECT 1 FROM public.services x
  WHERE x.sub_sector_id='fb630e15-a4a6-43d8-b002-ade1039f9edc' AND x.name=s.name);

-- Form templates (15, DRAFT)
INSERT INTO public.form_templates
  (name, description, form_type, status, regulator_id, sector_id, sub_sector_id, service_id,
   sector, sub_sector, service, is_reusable)
SELECT 'CU - '||s.name, 'CU-POSTLIC-2026-10 '||s.code, 'post_license', 'draft',
       '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3', sv.sector_id, sv.sub_sector_id, sv.id,
       'Credit Unions', 'Credit Union', s.name, false
FROM cu_spec s JOIN public.services sv
  ON sv.code=s.code AND sv.sub_sector_id='fb630e15-a4a6-43d8-b002-ade1039f9edc'
WHERE NOT EXISTS (SELECT 1 FROM public.form_templates t WHERE t.description='CU-POSTLIC-2026-10 '||s.code);

-- Staged field rows
CREATE TEMP TABLE cu_fields ON COMMIT DROP AS
WITH common_head(ord, sec, title, fname, label, ftype, req) AS (VALUES
  (1,'s1','Licence & Credit Union','licence_number','Licence Number','text',true),
  (2,'s1','Licence & Credit Union','credit_union_name','Credit Union Name','text',true),
  (3,'s1','Licence & Credit Union','registration_number','Registration Number','text',false),
  (4,'s1','Licence & Credit Union','contact_email','Contact Email','email',true),
  (5,'s2','Request Details','proposed_change','Description of Proposed Change','textarea',true),
  (6,'s2','Request Details','reason_for_change','Reason for Change','textarea',true),
  (7,'s2','Request Details','effective_date','Proposed Effective Date','date',true)),
common_tail(ord, sec, title, fname, label, ftype, req) AS (VALUES
  (1,'s5','Declaration','declaration_text','Declaration','paragraph',false),
  (2,'s5','Declaration','declaration_accept','I confirm the information is true and complete','checkbox',true),
  (3,'s5','Declaration','declarant_name','Declarant Name','text',true),
  (4,'s5','Declaration','declarant_position','Position','text',true),
  (5,'s5','Declaration','declaration_date','Date','date',true))
SELECT s.code, h.sec, h.title, CASE h.sec WHEN 's1' THEN 0 ELSE 1 END AS sec_order,
       h.ord AS sort_order, h.fname, h.label, h.ftype, h.req, NULL::jsonb AS options, NULL::jsonb AS validation
FROM cu_spec s CROSS JOIN common_head h
UNION ALL
SELECT s.code, 's3', 'Service Details', 2, f.ord::int, f.v->>0, f.v->>1, f.v->>2, (f.v->>3)::boolean,
       CASE WHEN jsonb_array_length(f.v) > 4 THEN f.v->4 END, NULL
FROM cu_spec s CROSS JOIN LATERAL jsonb_array_elements(s.fields) WITH ORDINALITY f(v, ord)
UNION ALL
SELECT s.code, 's4', 'Supporting Documents', 3, d.ord::int, d.v->>0, d.v->>1, 'file', (d.v->>2)::boolean, NULL,
       '{"allowedTypes":[".pdf",".jpg",".jpeg",".png"],"maxSizeMB":20}'::jsonb
FROM cu_spec s CROSS JOIN LATERAL jsonb_array_elements(s.docs) WITH ORDINALITY d(v, ord)
UNION ALL
SELECT s.code, t.sec, t.title, 4, t.ord, t.fname, t.label, t.ftype, t.req, NULL, NULL
FROM cu_spec s CROSS JOIN common_tail t;

-- Form versions (15, DRAFT, v1) with schema snapshot
INSERT INTO public.form_versions (template_id, version, status, semantic_version, change_notes, schema_snapshot)
SELECT t.id, 1, 'draft', '1.0', 'CU-POSTLIC-2026-10 initial draft',
  (SELECT jsonb_agg(jsonb_build_object(
      'id', sec, 'title', title, 'sortOrder', sec_order, 'isRepeatable', false, 'isVisible', true,
      'fields', flds) ORDER BY sec_order)
   FROM (SELECT sec, title, sec_order,
           jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', code||'-'||fname, 'type', ftype, 'label', label, 'fieldName', fname,
             'required', req, 'options', options, 'validation', validation,
             'content', CASE WHEN ftype='paragraph' THEN
               'I declare that the information provided is true, complete and accurate, and I am authorised to submit this request on behalf of the credit union.' END
           )) ORDER BY sort_order) AS flds
         FROM cu_fields cf WHERE cf.code = split_part(t.description,' ',2)
         GROUP BY sec, title, sec_order) secs)
FROM public.form_templates t
WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%'
  AND NOT EXISTS (SELECT 1 FROM public.form_versions v WHERE v.template_id=t.id);

-- Form fields (270)
INSERT INTO public.form_fields
  (version_id, section_id, section_title, section_order, section_is_repeatable, section_is_visible,
   field_type, label, field_name, required, options, validation, sort_order, content)
SELECT v.id, cf.sec, cf.title, cf.sec_order, false, true,
       cf.ftype, cf.label, cf.fname, cf.req, cf.options, cf.validation, cf.sort_order,
       CASE WHEN cf.ftype='paragraph' THEN
         'I declare that the information provided is true, complete and accurate, and I am authorised to submit this request on behalf of the credit union.' END
FROM public.form_templates t
JOIN public.form_versions v ON v.template_id=t.id AND v.version=1
JOIN cu_fields cf ON cf.code = split_part(t.description,' ',2)
WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%'
  AND NOT EXISTS (SELECT 1 FROM public.form_fields x WHERE x.version_id=v.id);

-- Assertions: any mismatch undoes everything
DO $$ BEGIN
  IF (SELECT count(*) FROM public.services WHERE code LIKE 'CU-PL-%'
        AND sub_sector_id='fb630e15-a4a6-43d8-b002-ade1039f9edc' AND status='inactive') <> 15
  THEN RAISE EXCEPTION 'services count mismatch'; END IF;
  IF (SELECT count(*) FROM public.form_templates
        WHERE description LIKE 'CU-POSTLIC-2026-10 CU-PL-%' AND status='draft') <> 15
  THEN RAISE EXCEPTION 'templates count mismatch'; END IF;
  IF (SELECT count(*) FROM public.form_versions v JOIN public.form_templates t ON t.id=v.template_id
        WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%' AND v.status='draft') <> 15
  THEN RAISE EXCEPTION 'versions count mismatch'; END IF;
  IF (SELECT count(*) FROM public.form_fields f JOIN public.form_versions v ON v.id=f.version_id
        JOIN public.form_templates t ON t.id=v.template_id
        WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%') <> 270
  THEN RAISE EXCEPTION 'fields count mismatch'; END IF;
  IF (SELECT count(*) FROM public.fee_configurations) <> 144
     OR (SELECT count(*) FROM public.approval_workflows) <> 16
     OR (SELECT count(*) FROM public.applications) <> 49
  THEN RAISE EXCEPTION 'unrelated table changed'; END IF;
END $$;

COMMIT;
```

### 3. After-check (read-only)
Expected totals: services 167, templates 228, versions 243 and fields 8,966. Fees stay at 144, workflows at 16 and applications at 49.

```sql
SELECT s.id AS new_service_id, s.code, s.status, t.id AS new_form_id, t.status AS form_status,
       v.status AS version_status,
       (SELECT count(*) FROM public.form_fields f WHERE f.version_id = v.id) AS fields
FROM public.services s
JOIN public.form_templates t ON t.service_id = s.id
JOIN public.form_versions v ON v.template_id = t.id
WHERE s.code LIKE 'CU-PL-%' ORDER BY s.code;
```

### 4. Guarded rollback (only if needed)
This deletes only the tagged new rows, and only when nothing references them. If anything does, it stops, and the records are retired instead.

```sql
BEGIN;
DO $$
DECLARE refs int;
BEGIN
  CREATE TEMP TABLE cu_v ON COMMIT DROP AS
    SELECT v.id FROM public.form_versions v JOIN public.form_templates t ON t.id=v.template_id
    WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%';
  CREATE TEMP TABLE cu_s ON COMMIT DROP AS
    SELECT id FROM public.services WHERE code LIKE 'CU-PL-%'
      AND sub_sector_id='fb630e15-a4a6-43d8-b002-ade1039f9edc'
      AND description LIKE 'CU-POSTLIC-2026-10%';

  SELECT
    (SELECT count(*) FROM public.applications WHERE form_version_id IN (SELECT id FROM cu_v)
        OR data->>'service_id' IN (SELECT id::text FROM cu_s))
  + (SELECT count(*) FROM public.application_form_requirements WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.application_form_versions WHERE version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.form_responses WHERE version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.form_submission_values WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.regulatory_request_form_requirements WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.return_filing_form_requirements WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.return_form_versions WHERE version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.return_form_data WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.fp_assessments WHERE form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.entity_appointments WHERE source_form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.entity_change_sets WHERE source_form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.ownership_interests WHERE source_form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.party_relationships WHERE source_form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.return_metric_values WHERE source_form_version_id IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.form_versions WHERE branched_from_version_id IN (SELECT id FROM cu_v)
        AND id NOT IN (SELECT id FROM cu_v))
  + (SELECT count(*) FROM public.fee_configurations WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.approval_workflows WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.post_license_acknowledgements WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.post_license_effects WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.post_license_effect_service_bindings WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.regulatory_service_tasks WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.service_config_expectations WHERE service_id IN (SELECT id FROM cu_s))
  + (SELECT count(*) FROM public.form_templates WHERE service_id IN (SELECT id FROM cu_s)
        AND description NOT LIKE 'CU-POSTLIC-2026-10 CU-PL-%')
  INTO refs;

  IF refs > 0 THEN
    RAISE EXCEPTION 'Rollback refused: % referencing rows. Retire instead of delete.', refs;
  END IF;

  DELETE FROM public.form_fields   WHERE version_id IN (SELECT id FROM cu_v);
  DELETE FROM public.form_versions WHERE id IN (SELECT id FROM cu_v);
  DELETE FROM public.form_templates WHERE description LIKE 'CU-POSTLIC-2026-10 CU-PL-%';
  DELETE FROM public.services WHERE id IN (SELECT id FROM cu_s);
END $$;
COMMIT;
```

## Technical notes
- New IDs come from the existing `gen_random_uuid()` column defaults. The script never supplies an ID and never targets an existing one. Before running, a quick read confirms the `id` defaults on `services`, `form_templates`, `form_versions` and `form_fields`.
- Execution is a single data-only operation. There is no migration, code change or file.
- Before running the rollback, re-list the foreign keys that reference `services` and `form_versions`. Add any new referencing table to the guard first.
