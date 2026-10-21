# Credit Union Post-Licensing Services and Forms — Proposed Configuration

Status: **PROPOSED, NOT EXECUTED.** Prepared 2026-10-21 for owner review.
No SQL has been run, no migration created, no code changed, nothing published or deployed.
Execution requires separate explicit owner authorization.

Tag on every proposed record: `CU-POSTLIC-2026-10`.

---

## 1. Findings (read-only, verified 2026-10-21)

| # | Finding | Evidence |
|---|---|---|
| F1 | The 19 existing Credit-Union-family services belong to sub-sector *Micro-credit Institution*, under the **inactive legacy sector** *Micro-credit Institution* (not Credit Unions). `sector_alias_map` maps it to Credit Unions only for entitlement and returns; the service picker does not use the map. | services / sub_sectors / sector_alias_map |
| F2 | Those 19 records are historical with dependencies: 15 fee rows, 3 post-approval effect bindings, 5 config expectations; 0 applications use them. **Left untouched.** | fee_configurations, post_license_effect_service_bindings, service_config_expectations |
| F3 | Reuse is not possible: a service has exactly one sector and sub-sector (unique on sector, sub-sector, name). New records are required. | `services_name_sector_sub_sector_unique` |
| F4 | Credit Unions sector has 0 services. Sub-sectors: Credit Union (active, `fb630e15-a4a6-43d8-b002-ade1039f9edc`), Credit Union League (active, out of scope). | services, sub_sectors |
| F5 | Licence renewal already exists in Licence Details (in-flight duplicate check, renewal fee from Fee Management, auto validity). **No renewal service is created.** | `src/pages/licenses/LicenseDetail.tsx` |
| F6 | **Credit Union League will not receive** any of the new services. | scope decision |

### 1.1 Unresolved eligibility issue (reported, not fixed)

`src/pages/NewPostLicenseApplication.tsx` (lines ~68–75) lists active services by **sub-sector when the licence has one, otherwise every active service in the licence's sector**.

Credit Union licences:

| Licence | Sub-sector |
|---|---|
| FSRA-SLU-2023-0002 | Credit Union |
| FSRA-DEMO-CREDIT_UNIONS | none |
| FSRA-DEMO-AML-04 | none |
| FSRA-DEMO-AML-05 | none |

If the new services were activated, the three licences without a sub-sector **would see them**. While the services are `inactive`, nothing is exposed. Options before activation (each needs separate approval): assign the Credit Union sub-sector to those licences via the existing licence-management process, or a code change.

### 1.2 Unverified server-side check

The applicant page calls `post_license_service_form_set(_service_id, _license_id)`. Whether this function rejects a service whose sub-sector differs from the licence's (or a licence with no sub-sector) was **not verified** — status **UNKNOWN**. The read-only role cannot execute or inspect function behaviour end-to-end here.

---

## 2. Service matrix (16 requested)

All approval/notification classifications are **provisional pending regulatory confirmation**. Fees: **Not configured — requires regulatory confirmation** (no fee rows proposed).

| # | Service | Code | Legacy equivalent | Status | Approval / Notification | Workflow (existing, link only) | F&P | SLA days |
|---|---|---|---|---|---|---|---|---|
| 1 | Licence Renewal | — | Renew | **Existing** (Licence Details) | Approval | existing renewal flow | — | — |
| 2 | Change of Registered Address | CU-PL-02 | Change of Registered Address | Proposed (inactive) | Approval | Standard | no | 30 |
| 3 | Change of Business or Contact Details | CU-PL-03 | none | Proposed (inactive) | Notification | Notification | no | 10 |
| 4 | Appointment of Director | CU-PL-04 | Director Appointment | Proposed (inactive) | Approval | Fit & Proper | yes | 45 |
| 5 | Resignation or Removal of Director | CU-PL-05 | Director Resignation | Proposed (inactive) | Notification | Notification | no | 10 |
| 6 | Appointment or Change of Senior Management | CU-PL-06 | Key Function Holder Change | Proposed (inactive) | Approval | Fit & Proper | yes | 45 |
| 7 | Change of Compliance Officer / MLRO | CU-PL-07 | none | Proposed (inactive) | Approval | Fit & Proper | yes | 45 |
| 8 | Amendment of Bye-Laws | CU-PL-08 | none | Proposed (inactive) | Approval | Standard | no | 30 |
| 9 | Change of Credit Union Name | CU-PL-09 | Change of Legal Name | Proposed (inactive) | Approval | Standard | no | 30 |
| 10 | Change in Authorized Activities | CU-PL-10 | Licence Variation | Proposed (inactive) | Approval | Enhanced | no | 60 |
| 11 | Opening or Relocation of Branch | CU-PL-11 | New Branch | Proposed (inactive) | Approval | Standard | no | 30 |
| 12 | Closure of Branch | CU-PL-12 | Branch Closure | Proposed (inactive) | Approval | Standard | no | 30 |
| 13 | Merger or Amalgamation | CU-PL-13 | Group Restructure | Proposed (inactive) | Approval | Enhanced | no | 90 |
| 14 | Voluntary Surrender of Licence | CU-PL-14 | Voluntary Surrender | Proposed (inactive) | Approval | Enhanced | no | 60 |
| 15 | Variation of Licence Conditions | CU-PL-15 | Licence Variation | Proposed (inactive) | Approval | Enhanced | no | 45 |
| 16 | Change in Governance Structure | CU-PL-16 | none | Proposed (inactive) | Approval | Enhanced | no | 60 |

SLA days are placeholders and need regulatory confirmation.

Workflow IDs (existing, unchanged):

| Pattern | Workflow | ID |
|---|---|---|
| Standard | Standard Post-License Approval | `7e9e0fc2-2961-42c2-a2fd-a0d6601707dc` |
| Enhanced | Enhanced Post-License Approval | `2b5fdc86-bf8a-4c96-9620-54585f5332e7` |
| Fit & Proper | Fit & Proper Post-License Approval | `24d71346-6214-49ed-8250-1cf09b9a7492` |
| Notification | Post-License Notification | `d2590edc-fa3a-421b-866d-905ebfee40d6` |

### 2.1 #10 vs #15 (both provisional)

| | #10 Change in Authorized Activities | #15 Variation of Licence Conditions |
|---|---|---|
| Subject | Adds/removes **regulated activities** (savings, lending, remittance, insurance agency…) | Changes **terms/conditions** attached to the licence; activities unchanged |
| Key form fields | Current activities, proposed activities, business plan summary, capital impact, risk & AML assessment, systems readiness | Condition reference, current wording, proposed wording, justification |
| Key documents | Business plan, board resolution, risk/AML assessment, financial projections | Supporting compliance evidence, board resolution |
| Expected outcome | Licence scope amended; possible new conditions; possible on-site review | Condition varied, refused, or alternative condition imposed |

No post-approval effects are bound to any new service: approval never auto-updates licence or entity data; changes remain with the existing authorized process.

---

## 3. Draft form definitions (15)

Each form: `form_templates.status='draft'`, `form_type='post_license'`, name `CU - <Service>`, sector Credit Unions, sub-sector Credit Union, `service_id` = its service, one `form_versions` row (version 1, `status='draft'`, `semantic_version='1.0'`).

### 3.1 Common sections (all 15 forms)

| Section | Field name | Label | Type | Required |
|---|---|---|---|---|
| s1 Licence & Credit Union | licence_number | Licence Number | text | yes |
| | credit_union_name | Credit Union Name | text | yes |
| | registration_number | Registration Number | text | no |
| | contact_email | Contact Email | email | yes |
| s2 Request Details | proposed_change | Description of Proposed Change | textarea | yes |
| | reason_for_change | Reason for Change | textarea | yes |
| | effective_date | Proposed Effective Date | date | yes |
| s3 (service-specific) | see 3.2 | | | |
| s4 Supporting Documents | (per service, see 3.2) | | file (PDF/JPG/PNG, ≤20MB) | per list |
| s5 Declaration | declaration_text | Declaration | paragraph | — |
| | declaration_accept | I confirm the information is true and complete | checkbox | yes |
| | declarant_name | Declarant Name | text | yes |
| | declarant_position | Position | text | yes |
| | declaration_date | Date | date | yes |

Licence/Credit Union fields are applicant-entered in v1. Read-only prefill depends on the existing renderer and is not claimed.

### 3.2 Service-specific fields and documents

| Code | Service-specific fields (s3) | Required documents (s4) |
|---|---|---|
| CU-PL-02 | new_address_line (text, req), new_parish (text, req), current_address (text, req) | proof_of_address (req), board_resolution (req) |
| CU-PL-03 | detail_type (select: Business Address/Phone/Email/Website/Other, req), current_value (text, req), new_value (text, req) | supporting_evidence (opt) |
| CU-PL-04 | director_full_name (text, req), director_nationality (text, req), director_dob (date, req), director_id_number (text, req) | cv (req), fit_and_proper_questionnaire (req), police_certificate (req), board_resolution (req) |
| CU-PL-05 | director_full_name (text, req), departure_type (select: Resignation/Removal, req), departure_reason (textarea, req) | resignation_or_removal_letter (req), board_minutes (opt) |
| CU-PL-06 | person_full_name (text, req), position_title (text, req), appointment_type (select: New/Replacement, req) | cv (req), fit_and_proper_questionnaire (req), police_certificate (req) |
| CU-PL-07 | role_type (select: Compliance Officer/MLRO/Both, req), person_full_name (text, req), outgoing_person_name (text, opt) | cv (req), fit_and_proper_questionnaire (req), aml_training_certificate (req) |
| CU-PL-08 | byelaw_clause_reference (text, req), current_clause_text (textarea, req), proposed_clause_text (textarea, req), agm_resolution_date (date, req) | amended_byelaws (req), agm_resolution (req) |
| CU-PL-09 | current_name (text, req), proposed_name (text, req) | name_reservation_or_registrar_approval (req), board_resolution (req) |
| CU-PL-10 | current_activities (textarea, req), proposed_activities (textarea, req), business_plan_summary (textarea, req), capital_impact (textarea, req), risk_aml_assessment (textarea, req), systems_readiness (textarea, req) | business_plan (req), board_resolution (req), risk_aml_assessment_doc (req), financial_projections (req) |
| CU-PL-11 | branch_action (select: Opening/Relocation, req), branch_name (text, req), branch_address (text, req), previous_address (text, opt) | premises_evidence (req), security_assessment (opt), board_resolution (req) |
| CU-PL-12 | branch_name (text, req), branch_address (text, req), member_notification_plan (textarea, req) | member_notice (req), board_resolution (req) |
| CU-PL-13 | counterparty_name (text, req), transaction_type (select: Merger/Amalgamation/Transfer of Engagements, req), member_vote_date (date, req), transaction_summary (textarea, req) | merger_agreement (req), member_resolution (req), financial_statements (req) |
| CU-PL-14 | surrender_reason (textarea, req), member_funds_plan (textarea, req), last_operating_date (date, req) | board_resolution (req), member_resolution (req), wind_down_plan (req) |
| CU-PL-15 | condition_reference (text, req), current_condition_wording (textarea, req), proposed_condition_wording (textarea, req), justification (textarea, req) | compliance_evidence (req), board_resolution (opt) |
| CU-PL-16 | current_structure (textarea, req), proposed_structure (textarea, req), committees_affected (textarea, opt) | revised_governance_chart (req), board_resolution (req) |

Field count per form = 12 common + service fields + documents. Total proposed `form_fields` rows: **246** (see §5).

---

## 4. Proposed SQL (NOT EXECUTED)

One transaction. Idempotent: every insert is guarded by `NOT EXISTS` on the tag/code, so a re-run inserts nothing. No UPDATE or DELETE of any existing row. The `TEMP` table is session-scoped and dropped at commit — it's not a schema change.

```sql
BEGIN;

-- Constants
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

-- 4.1 Services (15, all INACTIVE)
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

-- 4.2 Form templates (15, DRAFT)
INSERT INTO public.form_templates
  (name, description, form_type, status, regulator_id, sector_id, sub_sector_id, service_id,
   sector, sub_sector, service, is_reusable)
SELECT 'CU - '||s.name, 'CU-POSTLIC-2026-10 '||s.code, 'post_license', 'draft',
       '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3', sv.sector_id, sv.sub_sector_id, sv.id,
       'Credit Unions', 'Credit Union', s.name, false
FROM cu_spec s JOIN public.services sv
  ON sv.code=s.code AND sv.sub_sector_id='fb630e15-a4a6-43d8-b002-ade1039f9edc'
WHERE NOT EXISTS (SELECT 1 FROM public.form_templates t WHERE t.description='CU-POSTLIC-2026-10 '||s.code);

-- 4.3 Field rows staged once, reused for versions and fields
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

-- 4.4 Form versions (15, DRAFT, version 1) with schema_snapshot in FormSection[] shape
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

-- 4.5 Normalized form fields
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

-- 4.6 Post-insert assertions (abort the whole transaction on mismatch)
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
        WHERE t.description LIKE 'CU-POSTLIC-2026-10 CU-PL-%') <> 246
  THEN RAISE EXCEPTION 'fields count mismatch'; END IF;
END $$;

COMMIT;
```

Notes:
- `form_templates` has no `sub_sector_id` FK, but the value matches an existing sub-sector. `services` FKs to sector and sub-sector are satisfied.
- `form_field_definition_id` is left NULL, as for builder-created fields.
- Execution path: `run_sql` as a data-only operation after owner authorization. No migration file is needed.

---

## 5. Affected-record inventory and counts

Rows per form (12 common + service fields + documents):

| Code | Service fields | Docs | Rows |
|---|---|---|---|
| 02 | 3 | 2 | 17 |
| 03 | 3 | 1 | 16 |
| 04 | 4 | 4 | 20 |
| 05 | 3 | 2 | 17 |
| 06 | 3 | 3 | 18 |
| 07 | 3 | 3 | 18 |
| 08 | 4 | 2 | 18 |
| 09 | 2 | 2 | 16 |
| 10 | 6 | 4 | 22 |
| 11 | 4 | 3 | 19 |
| 12 | 3 | 2 | 17 |
| 13 | 4 | 3 | 19 |
| 14 | 3 | 3 | 18 |
| 15 | 4 | 2 | 18 |
| 16 | 3 | 2 | 17 |
| **Total** | 52 | 38 | **270?** see note |

Note: 12 common rows × 15 = 180, plus 52 service fields and 38 documents = **270**. The assertion in §4.6 must therefore read **270**, not 246. **Correction:** before execution, replace `246` with `270` in §4.6. The §3 text figure of 246 is superseded by 270.

| Table | Before (2026-10-21) | Insert | Expected after |
|---|---|---|---|
| services | 152 | 15 | 167 |
| form_templates | 213 (22 draft) | 15 | 228 (37 draft) |
| form_versions | 228 (25 draft) | 15 | 243 (40 draft) |
| form_fields | 8,696 | 270 | 8,966 |
| fee_configurations | 144 | 0 | 144 |
| approval_workflows | 16 | 0 | 16 |
| applications | 49 | 0 | 49 |
| licences, roles, returns, effects, other sectors | — | 0 | unchanged |

Pre-execution: re-take the "before" snapshot. If any figure differs from the table, stop and report.

---

## 6. Guarded rollback (NOT EXECUTED)

Deletes only tagged rows, and only if **nothing references them**. Otherwise it aborts and the records should be retired instead (service `inactive`, template/version `archived`).

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

Before running, re-list every foreign key referencing `services` and `form_versions` (`pg_constraint`). If a new referencing table has appeared, add it to the guard first.

---

## 7. Verification

### 7.1 Possible with Draft forms (after insert, before publication)
1. Admin → Form Management: 15 `CU - …` forms listed as **Draft** under Credit Unions / Credit Union.
2. Open each form and Preview: sections s1–s5, fields, required flags, select options and file limits match §3.
3. Master Configuration → Services: 15 CU-PL services are **inactive** and show the expected workflow.
4. Re-run the counts in §5: only the listed tables changed.
5. Log in as the FSRA-SLU-2023-0002 holder → `/post-license/new`: **no** new services visible (inactive). Repeat with a demo licence that has no sub-sector: also none.

### 7.2 Requires publication, activation and fee confirmation (not verifiable now)
1. Service appears for the eligible licence at `/post-license/new`, and does **not** appear for Credit Union League or other sectors. The no-sub-sector licences (§1.1) must be resolved first.
2. Selecting a service opens the matching form.
3. Validation, document upload, Save Draft, Review and Submit work.
4. Submission is linked to the correct entity and licence and shows in the applicant's Post-Licensing Applications list.
5. Request appears in `/applications/queue` and follows its workflow (Standard / Enhanced / Fit & Proper / Notification) with role-based actions.
6. Decisions, notifications and audit entries are produced by existing functionality.
7. Approval does not auto-change licence or entity data (no effects bound).
8. `post_license_service_form_set` behaviour for mismatched sub-sectors (§1.2).

---

## 8. Confirmation of non-impact (design level)

- No UPDATE or DELETE of existing rows; inserts are scoped to the Credit Union sub-sector and tagged.
- Not touched: legacy Micro-credit services, forms, fees, effects; other sectors; workflows; fees; roles; licences; applications; returns; renewal processing; Credit Union League.
- Services stay inactive and forms stay draft, so applicant and regulator screens are unchanged after insert.
- No migration, no code change, no publish.

## 9. Open items for regulatory / owner decision
1. Confirm the approval vs notification classification for each service.
2. Fees for each service (none proposed).
3. SLA days.
4. Keep #10 and #15 separate, or merge them.
5. Resolve the no-sub-sector licence eligibility (§1.1) before any activation.
6. Explicit authorization to run §4. Set the §4.6 field assertion to **270** first.
