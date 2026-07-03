
ALTER TABLE public.fp_assessments
  ADD COLUMN IF NOT EXISTS form_template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_version_id  uuid REFERENCES public.form_versions(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_response_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fp_assess_form_version ON public.fp_assessments(form_version_id);
CREATE INDEX IF NOT EXISTS idx_fp_assess_form_response ON public.fp_assessments(form_response_id);

DO $seed$
DECLARE
  v_template_id uuid := '11111111-2222-3333-4444-000000000f01';
  v_version_id  uuid := '11111111-2222-3333-4444-000000000f02';
  v_schema jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.form_templates WHERE id = v_template_id) THEN
    INSERT INTO public.form_templates(id, name, description, form_type, sector, sub_sector, category, service, is_reusable, status, form_order)
    VALUES (
      v_template_id,
      'Fit & Proper — Personal Questionnaire (PQ)',
      'Master Personal Questionnaire covering all statutory Fit & Proper disclosures. Editable in Form Builder; new versions apply to new assessments only.',
      'fit_and_proper', '', '', '', 'pq', true, 'published', 0
    );
  END IF;

  v_schema := jsonb_build_array(
    jsonb_build_object('id','sec-identity','title','1. Identity','sortOrder',1,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-id-1','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-full-name','type','text','label','Full legal name','fieldName','full_name','required',true),
          jsonb_build_object('id','f-dob','type','date','label','Date of birth','fieldName','date_of_birth','required',true)
        )),
        jsonb_build_object('id','r-id-2','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-nat-id','type','text','label','National ID / passport number','fieldName','national_id','required',true),
          jsonb_build_object('id','f-nationality','type','text','label','Nationality','fieldName','nationality','required',true)
        )),
        jsonb_build_object('id','r-id-3','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-address','type','textarea','label','Residential address','fieldName','address','required',true),
          jsonb_build_object('id','f-contact','type','phone','label','Contact number','fieldName','contact_number','required',false)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-qual','title','2. Qualifications','sortOrder',2,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-q-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-qual-tbl','type','table','label','Academic & professional qualifications','fieldName','qualifications','required',true,
            'tableColumns', jsonb_build_array(
              jsonb_build_object('id','c-q-title','label','Qualification','type','text'),
              jsonb_build_object('id','c-q-inst','label','Institution','type','text'),
              jsonb_build_object('id','c-q-year','label','Year','type','number')
            ))
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-emp','title','3. Employment history','sortOrder',3,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-e-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-emp-tbl','type','table','label','Employment history (last 10 years)','fieldName','employment_history','required',true,
            'tableColumns', jsonb_build_array(
              jsonb_build_object('id','c-e-emp','label','Employer','type','text'),
              jsonb_build_object('id','c-e-role','label','Role','type','text'),
              jsonb_build_object('id','c-e-from','label','From','type','date'),
              jsonb_build_object('id','c-e-to','label','To','type','date'),
              jsonb_build_object('id','c-e-reason','label','Reason for leaving','type','text')
            ))
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-dir','title','4. Directorships & key roles','sortOrder',4,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-d-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-dir-tbl','type','table','label','Current & past directorships / key positions','fieldName','directorships','required',false,
            'tableColumns', jsonb_build_array(
              jsonb_build_object('id','c-d-entity','label','Entity','type','text'),
              jsonb_build_object('id','c-d-role','label','Role','type','text'),
              jsonb_build_object('id','c-d-from','label','From','type','date'),
              jsonb_build_object('id','c-d-to','label','To','type','date')
            ))
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-own','title','5. Ownership & control interests','sortOrder',5,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-o-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-own','type','textarea','label','List any shareholding of 5% or more in any entity, and any other means of control','fieldName','ownership_interests','required',false)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-crim','title','6. Criminal & regulatory history','sortOrder',6,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-c-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-crim','type','textarea','label','Convictions, cautions, pending charges or regulator sanctions (with dates and jurisdictions)','fieldName','criminal_regulatory_history','required',true)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-bank','title','7. Bankruptcy / insolvency','sortOrder',7,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-b-1','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-bank','type','radio','label','Have you ever been declared bankrupt or subject to insolvency proceedings?','fieldName','bankruptcy_flag','required',true,'options', jsonb_build_array('No','Yes')),
          jsonb_build_object('id','f-bank-det','type','textarea','label','If yes, provide details','fieldName','bankruptcy_details','required',false)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-disc','title','8. Disciplinary history','sortOrder',8,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-di-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-disc','type','textarea','label','Disciplinary action by any professional body, employer or regulator','fieldName','disciplinary_history','required',true)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-coi','title','9. Conflicts of interest','sortOrder',9,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-coi-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-coi','type','textarea','label','Actual or potential conflicts of interest arising from any current or proposed role','fieldName','conflicts_of_interest','required',true)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-rp','title','10. Related parties','sortOrder',10,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-rp-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-rp','type','textarea','label','Family / business relationships with other regulated entities, licensees or shareholders','fieldName','related_parties','required',false)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-aml','title','11. AML/CFT disclosures','sortOrder',11,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-aml-1','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-pep','type','radio','label','Are you a Politically Exposed Person (PEP) or closely associated with one?','fieldName','pep_status','required',true,'options', jsonb_build_array('No','Yes')),
          jsonb_build_object('id','f-aml-det','type','textarea','label','If yes, provide details','fieldName','pep_details','required',false)
        )),
        jsonb_build_object('id','r-aml-2','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-aml-training','type','textarea','label','AML/CFT training completed (course, provider, date)','fieldName','aml_training','required',false)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-docs','title','12. Supporting documents','sortOrder',12,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-docs-1','columns',2,'fields', jsonb_build_array(
          jsonb_build_object('id','f-cv','type','file','label','Curriculum Vitae','fieldName','cv','required',true),
          jsonb_build_object('id','f-id-doc','type','file','label','Government-issued ID','fieldName','id_document','required',true)
        )),
        jsonb_build_object('id','r-docs-2','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-other-docs','type','file','label','Other supporting documents','fieldName','other_documents','required',false,'allowMultiple',true)
        ))
      ), 'fields', jsonb_build_array()),
    jsonb_build_object('id','sec-consent','title','13. Consent & declaration','sortOrder',13,'isRepeatable',false,
      'rows', jsonb_build_array(
        jsonb_build_object('id','r-con-1','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-consent-check','type','checkbox','label','Consent to background & regulatory checks','fieldName','consent_checks','required',true,'options', jsonb_build_array('I consent to the regulator carrying out background, criminal, credit and regulatory checks.'))
        )),
        jsonb_build_object('id','r-con-2','columns',1,'fields', jsonb_build_array(
          jsonb_build_object('id','f-decl-check','type','checkbox','label','Declaration','fieldName','declaration_confirm','required',true,'options', jsonb_build_array('I confirm the information provided is true, accurate and complete. I understand that misrepresentation may result in refusal of authorisation, revocation of any authorisation granted, and referral to law-enforcement authorities.'))
        ))
      ), 'fields', jsonb_build_array())
  );

  IF NOT EXISTS (SELECT 1 FROM public.form_versions WHERE id = v_version_id) THEN
    INSERT INTO public.form_versions(id, template_id, version, semantic_version, schema_snapshot, status, published_at, effective_from)
    VALUES (v_version_id, v_template_id, 1, '1.0', v_schema, 'published', now(), now());
  END IF;
END
$seed$;

CREATE OR REPLACE FUNCTION public.fp_pin_pq_form_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tpl uuid;
  v_ver uuid;
BEGIN
  IF NEW.form_version_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ft.id, fv.id
    INTO v_tpl, v_ver
    FROM public.form_templates ft
    JOIN public.form_versions  fv ON fv.template_id = ft.id
   WHERE ft.form_type = 'fit_and_proper'
     AND ft.service   = 'pq'
     AND ft.status = 'published'
     AND fv.status = 'published'
   ORDER BY fv.version DESC, fv.published_at DESC NULLS LAST
   LIMIT 1;

  IF v_tpl IS NOT NULL THEN
    NEW.form_template_id := v_tpl;
    NEW.form_version_id  := v_ver;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_fp_pin_pq_form ON public.fp_assessments;
CREATE TRIGGER trg_fp_pin_pq_form
BEFORE INSERT ON public.fp_assessments
FOR EACH ROW EXECUTE FUNCTION public.fp_pin_pq_form_on_insert();

UPDATE public.fp_assessments a
   SET form_template_id = '11111111-2222-3333-4444-000000000f01',
       form_version_id  = '11111111-2222-3333-4444-000000000f02'
 WHERE a.form_version_id IS NULL;
