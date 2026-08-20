
-- ============ 44/45/46/47. MODULES & PERMISSIONS ============
INSERT INTO public.sec_modules (key,label,description,module_type,audience,sort_order,is_system,is_active)
VALUES
 ('entity_structure','Entity Structure','Ownership, control, governance and relationships of regulated entities','feature','internal',560,true,true),
 ('regulatory_requests','Regulatory Requests','Post-authorisation regulatory requests and notifications','feature','internal',570,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_permissions (module_id,key,label,description,sort_order,is_sensitive,is_enforced,is_system,is_active)
SELECT m.id, v.key, v.label, v.description, v.sort_order, v.sensitive, true, true, true
  FROM (VALUES
   ('form_management','publish','Publish form version','Publish a draft form version',40,true),
   ('form_management','retire','Retire form definition','Retire a form definition or published version',50,true),
   ('form_management','manage_packages','Manage form packages','Create and maintain form packages',60,false),
   ('form_management','manage_applicability','Manage applicability','Configure package applicability rules',70,true),
   ('entity_structure','view','View entity structure','View ownership, governance and relationships',10,false),
   ('entity_structure','propose','Propose structural change','Prepare a proposed entity change set',20,false),
   ('entity_structure','review','Review structural change','Review submitted structural changes',30,false),
   ('entity_structure','approve','Approve structural change','Approve an entity change set',40,true),
   ('entity_structure','apply','Apply structural change','Apply an approved change set to canonical state',50,true),
   ('entity_structure','view_history','View structural history','View historical and provenance records',60,false),
   ('regulatory_requests','view','View regulatory requests','View regulatory requests',10,false),
   ('regulatory_requests','create','Create regulatory request','Start a regulatory request',20,false),
   ('regulatory_requests','review','Review regulatory request','Review a submitted request',30,false),
   ('regulatory_requests','assign','Assign regulatory request','Assign a request to an officer',40,false),
   ('regulatory_requests','approve','Approve regulatory request','Approve a regulatory request',50,true),
   ('regulatory_requests','reject','Reject regulatory request','Reject a regulatory request',60,true),
   ('regulatory_requests','close','Close regulatory request','Close a regulatory request',70,true)
  ) AS v(module,key,label,description,sort_order,sensitive)
  JOIN public.sec_modules m ON m.key = v.module
ON CONFLICT DO NOTHING;

-- ============ 48-52. ROLE TEMPLATES ============
INSERT INTO public.sec_role_templates (key,name,description,role_type,dashboard_tier,sort_order,is_system,is_active)
VALUES
 ('regulatory_forms_designer','Regulatory Forms Designer','Designs form definitions, fields, concept bindings and draft packages. Cannot publish.','internal','operational',300,true,true),
 ('regulatory_forms_publisher','Regulatory Forms Publisher','Reviews and publishes form versions and activates applicability.','internal','operational',310,true,true),
 ('entity_structure_officer','Entity Structure Officer','Reviews submitted ownership, governance and relationship changes and prepares change sets.','internal','operational',320,true,true),
 ('entity_structure_supervisor','Entity Structure Supervisor','Approves and applies entity structural changes and controlled data corrections.','internal','supervisory',330,true,true)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.wb_grant_template(_template_key text, _perms text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tpl uuid; v_p text;
BEGIN
  SELECT id INTO v_tpl FROM public.sec_role_templates WHERE key = _template_key;
  IF v_tpl IS NULL THEN RETURN; END IF;
  FOREACH v_p IN ARRAY _perms LOOP
    INSERT INTO public.sec_role_template_permissions (template_id, permission_id)
    SELECT v_tpl, p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
     WHERE m.key = split_part(v_p,'.',1) AND p.key = split_part(v_p,'.',2)
       AND NOT EXISTS (SELECT 1 FROM public.sec_role_template_permissions x
                        WHERE x.template_id = v_tpl AND x.permission_id = p.id);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.wb_grant_template(text, text[]) FROM PUBLIC, anon, authenticated;

SELECT public.wb_grant_template('regulatory_forms_designer', ARRAY[
  'form_management.view','form_management.create','form_management.edit',
  'form_management.manage_packages','regulatory_data_model.view']);
SELECT public.wb_grant_template('regulatory_forms_publisher', ARRAY[
  'form_management.view','form_management.publish','form_management.retire',
  'form_management.manage_applicability','form_management.manage_packages','regulatory_data_model.view']);
SELECT public.wb_grant_template('entity_structure_officer', ARRAY[
  'entity_structure.view','entity_structure.propose','entity_structure.review',
  'entity_structure.view_history','regulatory_requests.view','regulatory_requests.review',
  'licensee_management.view']);
SELECT public.wb_grant_template('entity_structure_supervisor', ARRAY[
  'entity_structure.view','entity_structure.propose','entity_structure.review',
  'entity_structure.approve','entity_structure.apply','entity_structure.view_history',
  'regulatory_requests.view','regulatory_requests.review','regulatory_requests.assign',
  'regulatory_requests.approve','regulatory_requests.reject','regulatory_requests.close',
  'licensee_management.view']);

-- 53. existing templates: additive view/review only, nothing sensitive
SELECT public.wb_grant_template('regulatory_data_administrator', ARRAY[
  'regulatory_data_model.view','regulatory_data_model.manage','form_management.view']);
SELECT public.wb_grant_template('licensing_officer', ARRAY[
  'entity_structure.view','regulatory_requests.view','regulatory_requests.review','form_management.view']);
SELECT public.wb_grant_template('licensing_supervisor', ARRAY[
  'entity_structure.view','entity_structure.view_history','regulatory_requests.view',
  'regulatory_requests.review','regulatory_requests.assign','form_management.view']);
SELECT public.wb_grant_template('fit_proper_officer', ARRAY['entity_structure.view']);
SELECT public.wb_grant_template('fit_proper_supervisor', ARRAY['entity_structure.view','entity_structure.view_history']);
SELECT public.wb_grant_template('auditor', ARRAY[
  'entity_structure.view','entity_structure.view_history','regulatory_requests.view',
  'form_management.view','regulatory_data_model.view']);

-- ============ 54. EXTERNAL MEMBERSHIP CAPABILITIES ============
ALTER TABLE public.entity_membership_role_permissions
  DROP CONSTRAINT IF EXISTS entity_membership_capability_vocab;
ALTER TABLE public.entity_membership_role_permissions
  ADD CONSTRAINT entity_membership_capability_vocab CHECK (capability = ANY (ARRAY[
    'view_status','submit','upload_documents','respond_rfi','pay','manage_users',
    'start_regulatory_request','submit_structural_form']));

INSERT INTO public.entity_membership_role_permissions (membership_role_id, capability)
SELECT r.id, c.capability
  FROM public.entity_membership_roles r
  CROSS JOIN (VALUES ('start_regulatory_request'),('submit_structural_form')) AS c(capability)
 WHERE r.key IN ('PRIMARY_REPRESENTATIVE','AUTHORIZED_REPRESENTATIVE')
   AND NOT EXISTS (SELECT 1 FROM public.entity_membership_role_permissions x
                    WHERE x.membership_role_id = r.id AND x.capability = c.capability);

-- ============ 55/56. ROUTES & MENU ============
INSERT INTO public.sec_routes (key,path_pattern,match_type,required_permission_id,audience,is_protected,is_system,is_active,priority)
SELECT v.key, v.path, 'exact',
       (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id=p.module_id
         WHERE m.key = split_part(v.perm,'.',1) AND p.key = split_part(v.perm,'.',2)),
       'internal', true, true, true, 0
  FROM (VALUES
   ('route_entity_detail','/entities/:entityId','entity_structure.view'),
   ('route_regulatory_requests','/licensing/regulatory-requests','regulatory_requests.view'),
   ('route_regulatory_request_detail','/licensing/regulatory-requests/:requestId','regulatory_requests.view'),
   ('route_admin_forms_packages','/admin/forms-packages','form_management.view')
  ) AS v(key,path,perm)
ON CONFLICT (key) DO NOTHING;

-- bind existing /admin/forms route to real form permission
UPDATE public.sec_routes r
   SET required_permission_id = (SELECT p.id FROM public.sec_permissions p
        JOIN public.sec_modules m ON m.id=p.module_id
        WHERE m.key='form_management' AND p.key='view')
 WHERE r.key = 'admin_forms' AND r.required_permission_id IS NULL;

INSERT INTO public.sec_navigation_items (key,parent_id,label,description,item_type,route_id,icon_key,sort_order,audience,is_active,show_in_sidebar,show_in_search,is_system,required_permission_id)
SELECT 'nav_lic_regulatory_requests',
       (SELECT id FROM public.sec_navigation_items WHERE key='grp_nav_licensing'),
       'Regulatory Requests','Post-authorisation regulatory requests','link',
       (SELECT id FROM public.sec_routes WHERE key='route_regulatory_requests'),
       'ClipboardList',125,'internal',true,true,true,true,
       (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id=p.module_id
         WHERE m.key='regulatory_requests' AND p.key='view')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key='nav_lic_regulatory_requests');

INSERT INTO public.sec_navigation_items (key,parent_id,label,description,item_type,route_id,icon_key,sort_order,audience,is_active,show_in_sidebar,show_in_search,is_system,required_permission_id)
SELECT 'nav_adm_cfg_forms_packages',
       (SELECT id FROM public.sec_navigation_items WHERE key='nav_adm_configuration'),
       'Forms & Packages','Form definitions, versions, fields, concept bindings and packages','link',
       (SELECT id FROM public.sec_routes WHERE key='route_admin_forms_packages'),
       'FileStack',35,'internal',true,true,true,true,
       (SELECT p.id FROM public.sec_permissions p JOIN public.sec_modules m ON m.id=p.module_id
         WHERE m.key='form_management' AND p.key='view')
WHERE NOT EXISTS (SELECT 1 FROM public.sec_navigation_items WHERE key='nav_adm_cfg_forms_packages');

-- ============ 3. DATA CONCEPT SEEDS ============
INSERT INTO public.data_concepts (code,name,description,data_domain_id,data_type,cardinality,sensitivity_classification,value_source_type,canonical_target,projection_strategy,is_system)
VALUES
 ('ENTITY.LEGAL_NAME','Entity legal name','Registered legal name of the organization',NULL,'TEXT','SINGLE','PUBLIC','FREE_INPUT','organization_names','PROPOSE_ORGANIZATION_NAME',true),
 ('ENTITY.TRADING_NAME','Entity trading name','Trading or business name',NULL,'TEXT','MULTIPLE','PUBLIC','FREE_INPUT','organization_names','PROPOSE_ORGANIZATION_NAME',true),
 ('ENTITY.INCORPORATION_DATE','Date of incorporation','Date the organization was incorporated',NULL,'DATE','SINGLE','PUBLIC','FREE_INPUT','entity_facts','PROPOSE_ENTITY_FACT',true),
 ('ENTITY.REGISTRATION_NUMBER','Company registration number','Registry-issued company number',NULL,'TEXT','SINGLE','INTERNAL','FREE_INPUT','entity_identifiers','PROPOSE_ENTITY_FACT',true),
 ('ENTITY.REGISTERED_ADDRESS','Registered address','Registered office address',NULL,'TEXT','SINGLE','INTERNAL','FREE_INPUT','entity_facts','PROPOSE_ENTITY_FACT',true),
 ('ENTITY.LEGAL_FORM','Legal form','Legal form / constitution of the organization',NULL,'ENUM','SINGLE','PUBLIC','CLASSIFICATION','classification_values','PROPOSE_CLASSIFICATION',true),
 ('PERSON.FULL_NAME','Person full name','Full legal name of a natural person',NULL,'TEXT','SINGLE','INTERNAL','FREE_INPUT','persons','PROPOSE_APPOINTMENT',true),
 ('PERSON.DATE_OF_BIRTH','Person date of birth','Date of birth of a natural person',NULL,'DATE','SINGLE','CONFIDENTIAL','FREE_INPUT','persons','CAPTURE_ONLY',true),
 ('PERSON.NATIONALITY','Person nationality','Nationality of a natural person',NULL,'ENUM','SINGLE','CONFIDENTIAL','MASTER_DATA','persons','CAPTURE_ONLY',true),
 ('OWNERSHIP.SHARES_HELD','Shares held','Number of shares held by the owner',NULL,'NUMBER','SINGLE','INTERNAL','FREE_INPUT','ownership_interests','PROPOSE_OWNERSHIP',true),
 ('OWNERSHIP.ECONOMIC_INTEREST_PERCENTAGE','Economic interest %','Economic interest expressed as a percentage',NULL,'PERCENTAGE','SINGLE','INTERNAL','FREE_INPUT','ownership_interests','PROPOSE_OWNERSHIP',true),
 ('OWNERSHIP.VOTING_RIGHTS_PERCENTAGE','Voting rights %','Voting rights expressed as a percentage',NULL,'PERCENTAGE','SINGLE','INTERNAL','FREE_INPUT','ownership_interests','PROPOSE_OWNERSHIP',true),
 ('OWNERSHIP.BENEFICIAL_INTEREST_PERCENTAGE','Beneficial interest %','Ultimate beneficial interest percentage',NULL,'PERCENTAGE','SINGLE','CONFIDENTIAL','FREE_INPUT','ownership_interests','PROPOSE_OWNERSHIP',true),
 ('OWNERSHIP.IS_BENEFICIAL_OWNER','Beneficial owner indicator','Whether the owner is a declared beneficial owner',NULL,'BOOLEAN','SINGLE','CONFIDENTIAL','FREE_INPUT','ownership_interests','PROPOSE_OWNERSHIP',true),
 ('GOVERNANCE.ROLE','Governance role','Role held at the entity',NULL,'ENUM','SINGLE','INTERNAL','MASTER_DATA','entity_appointments','PROPOSE_APPOINTMENT',true),
 ('GOVERNANCE.APPOINTMENT_DATE','Appointment date','Date of appointment to the role',NULL,'DATE','SINGLE','INTERNAL','FREE_INPUT','entity_appointments','PROPOSE_APPOINTMENT',true),
 ('GOVERNANCE.RESIGNATION_DATE','Resignation date','Date the role holder ceased to hold the role',NULL,'DATE','SINGLE','INTERNAL','FREE_INPUT','entity_appointments','PROPOSE_APPOINTMENT',true),
 ('RELATIONSHIP.RELATED_PARTY','Related party','Counterparty in a group or service relationship',NULL,'TEXT','MULTIPLE','INTERNAL','FREE_INPUT','party_relationships','PROPOSE_RELATIONSHIP',true),
 ('RELATIONSHIP.TYPE','Relationship type','Configured relationship type',NULL,'ENUM','SINGLE','INTERNAL','MASTER_DATA','party_relationships','PROPOSE_RELATIONSHIP',true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.data_concepts c
   SET data_domain_id = d.id
  FROM public.data_domains d
 WHERE c.data_domain_id IS NULL
   AND d.key = CASE split_part(c.code,'.',1)
       WHEN 'ENTITY' THEN 'entity_identity'
       WHEN 'PERSON' THEN 'person_identity'
       WHEN 'OWNERSHIP' THEN 'ownership'
       WHEN 'GOVERNANCE' THEN 'governance'
       WHEN 'RELATIONSHIP' THEN 'group_structure' END;

-- ============ 34. REGULATORY REQUEST TYPE SEEDS ============
INSERT INTO public.regulatory_request_types (key,label,description,requires_change_set,requires_approval,external_startable,min_membership_capability,sort_order,is_system)
VALUES
 ('CHANGE_OF_LEGAL_NAME','Change of legal name','Request to change the registered legal name',true,true,true,'start_regulatory_request',10,true),
 ('CHANGE_OF_ADDRESS','Change of address','Notification of a change of registered or business address',true,true,true,'start_regulatory_request',20,true),
 ('CHANGE_OF_CONTROL','Change of control','Application for approval of a change of control',true,true,true,'start_regulatory_request',30,true),
 ('SHAREHOLDING_CHANGE','Shareholding change','Change in shareholding or ownership interests',true,true,true,'start_regulatory_request',40,true),
 ('BENEFICIAL_OWNER_CHANGE','Beneficial owner change','Change in ultimate beneficial ownership',true,true,true,'start_regulatory_request',50,true),
 ('DIRECTOR_APPOINTMENT','Director appointment','Proposed appointment of a director',true,true,true,'start_regulatory_request',60,true),
 ('DIRECTOR_RESIGNATION','Director resignation','Notification of a director resignation',true,true,true,'start_regulatory_request',70,true),
 ('KEY_PERSON_CHANGE','Key person change','Change of a key function holder',true,true,true,'start_regulatory_request',80,true),
 ('GROUP_RESTRUCTURE','Group restructure','Restructuring of the group',true,true,true,'start_regulatory_request',90,true),
 ('NEW_BRANCH','New branch','Application or notification for a new branch',true,true,true,'start_regulatory_request',100,true),
 ('BRANCH_CLOSURE','Branch closure','Notification of a branch closure',true,true,true,'start_regulatory_request',110,true),
 ('OUTSOURCING_NOTIFICATION','Outsourcing notification','Notification of a material outsourcing arrangement',true,false,true,'start_regulatory_request',120,true),
 ('AUDITOR_CHANGE','Auditor change','Change of external auditor',true,true,true,'start_regulatory_request',130,true),
 ('LICENSE_VARIATION','Licence variation','Request to vary licence scope or conditions',false,true,true,'start_regulatory_request',140,true),
 ('LICENSE_RENEWAL','Licence renewal','Application to renew a licence',false,true,true,'start_regulatory_request',150,true),
 ('LICENSE_SURRENDER','Licence surrender','Request to surrender a licence',false,true,true,'start_regulatory_request',160,true),
 ('MATERIAL_INCIDENT','Material incident notification','Notification of a material incident',false,false,true,'submit_structural_form',170,true)
ON CONFLICT (key) DO NOTHING;
