-- ============================================================
-- EPR-03 — Enforcement authorities + workflow configuration seed
-- ============================================================

-- ---------- 1. new enforcement authorities
INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, v.key, v.label, v.description, v.sort_order, v.sensitive, true, true, true
  FROM public.sec_modules m
  CROSS JOIN (VALUES
    ('refer',           'Refer to Enforcement', 'Refer a source matter to the Enforcement process. Does not confer enforcement decision authority.', 30, false),
    ('issue_notice',    'Issue Enforcement Notice', 'Issue a formal enforcement notice to a regulated entity.', 40, true),
    ('decide',          'Make Enforcement Decision', 'Take the final enforcement decision on a case.', 50, true),
    ('impose_sanction', 'Impose Sanction / Directive', 'Impose the sanction or issue the directive flowing from an enforcement decision.', 60, true),
    ('close',           'Close Enforcement Case', 'Close an enforcement case once obligations are discharged.', 70, true)
  ) AS v(key, label, description, sort_order, sensitive)
 WHERE m.key = 'enforcement_management'
   AND NOT EXISTS (SELECT 1 FROM public.sec_permissions p WHERE p.module_id = m.id AND p.key = v.key);

-- lifecycle authorities follow existing enforcement workflow operators
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
  FROM public.sec_role_permissions rp
  JOIN public.sec_permissions ep ON ep.id = rp.permission_id
  JOIN public.sec_modules em ON em.id = ep.module_id AND em.key = 'enforcement_management'
  JOIN public.sec_permissions np ON np.module_id = em.id
 WHERE ep.key IN ('workflow_action','edit')
   AND np.key IN ('refer','issue_notice','decide','impose_sanction','close')
   AND NOT EXISTS (SELECT 1 FROM public.sec_role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = np.id);

-- cross-domain referral authority only (no enforcement decision powers)
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
  FROM public.sec_role_permissions rp
  JOIN public.sec_permissions dp ON dp.id = rp.permission_id
  JOIN public.sec_modules dm ON dm.id = dp.module_id
  JOIN public.sec_modules em ON em.key = 'enforcement_management'
  JOIN public.sec_permissions np ON np.module_id = em.id AND np.key = 'refer'
 WHERE dm.key IN ('prudential_supervision','market_conduct','complaint_management','license_management','fit_and_proper')
   AND dp.key IN ('workflow_action','approve')
   AND NOT EXISTS (SELECT 1 FROM public.sec_role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = np.id);

-- ---------- 2. stage configuration (version 1)
INSERT INTO public.enforcement_workflow_stages (version, stage, label, seq, sla_days, due_soon_days, waiting_on, description, is_terminal)
VALUES
  (1,'REFERRAL','Referral',1,5,2,'regulator','A source matter has been referred. Enforcement must accept or decline the referral.',false),
  (1,'ASSESSMENT','Assessment',2,20,5,'regulator','Enforcement assesses the referred matter and the supporting evidence.',false),
  (1,'NOTICE','Notice issued',3,10,3,'entity','A formal notice has been issued to the entity.',false),
  (1,'REPRESENTATIONS','Representations',4,21,5,'entity','The entity may make representations before a decision is taken.',false),
  (1,'DECISION','Decision',5,15,3,'regulator','The decision maker weighs the evidence and representations.',false),
  (1,'SANCTION','Sanction / directive',6,10,3,'regulator','The sanction or directive flowing from the decision is imposed.',false),
  (1,'REMEDIATION_MONITORING','Remediation monitoring',7,30,7,'entity','Obligations, remediation evidence and penalty settlement are monitored.',false),
  (1,'APPEAL','Appeal',8,30,7,'third_party','An appeal against the enforcement decision is under review.',false),
  (1,'CLOSED','Closed',9,0,0,'system','The enforcement case is closed.',true),
  (1,'WITHDRAWN','Withdrawn',10,0,0,'system','The enforcement case was withdrawn.',true)
ON CONFLICT (version, stage) DO UPDATE
  SET label = EXCLUDED.label, seq = EXCLUDED.seq, sla_days = EXCLUDED.sla_days,
      due_soon_days = EXCLUDED.due_soon_days, waiting_on = EXCLUDED.waiting_on,
      description = EXCLUDED.description, is_terminal = EXCLUDED.is_terminal;

-- ---------- 3. transition configuration (version 1)
INSERT INTO public.enforcement_workflow_transitions
  (version, action_code, label, from_stage, to_stage, to_status, seq, permission_action,
   requires_rationale, min_rationale_length, requires_evidence, requires_maker_checker, description)
VALUES
  (1,'ACCEPT_REFERRAL','Accept referral and begin assessment','REFERRAL','ASSESSMENT','open',10,'workflow_action',true,10,false,false,'Confirms the referred matter is within enforcement scope.'),
  (1,'WITHDRAW','Withdraw case','REFERRAL','WITHDRAWN','withdrawn',90,'decide',true,20,false,false,'Declines or withdraws the matter from enforcement.'),
  (1,'BEGIN_ASSESSMENT','Record assessment findings','ASSESSMENT','ASSESSMENT',NULL,10,'workflow_action',true,10,false,false,'Records the enforcement assessment of the referred matter.'),
  (1,'ISSUE_NOTICE','Issue enforcement notice','ASSESSMENT','NOTICE','notice_issued',20,'issue_notice',true,20,true,false,'Issues the formal notice. Requires assessment findings and a notice reference.'),
  (1,'WITHDRAW','Withdraw case','ASSESSMENT','WITHDRAWN','withdrawn',90,'decide',true,20,false,false,'Closes the matter without enforcement action.'),
  (1,'RECORD_REPRESENTATION','Record representation received','NOTICE','REPRESENTATIONS','response_received',10,'workflow_action',true,10,false,false,'Records a representation received from the entity.'),
  (1,'COMPLETE_EVIDENCE_REVIEW','Complete evidence review','NOTICE','DECISION',NULL,20,'workflow_action',true,10,false,false,'Closes the representation window and refers the case to the decision maker.'),
  (1,'RECORD_REPRESENTATION','Record further representation','REPRESENTATIONS','REPRESENTATIONS',NULL,10,'workflow_action',true,10,false,false,'Records a further representation received from the entity.'),
  (1,'COMPLETE_EVIDENCE_REVIEW','Complete evidence review','REPRESENTATIONS','DECISION',NULL,20,'workflow_action',true,10,false,false,'Confirms the evidence and representations are complete.'),
  (1,'MAKE_DECISION','Make enforcement decision','DECISION','SANCTION','decided',10,'decide',true,20,false,true,'Records the final enforcement decision, its legal basis and rationale.'),
  (1,'CLOSE_NO_ACTION','Decide no enforcement action','DECISION','CLOSED','closed',20,'decide',true,20,false,true,'Concludes that no enforcement action is warranted.'),
  (1,'IMPOSE_SANCTION','Impose sanction','SANCTION','REMEDIATION_MONITORING','active',10,'impose_sanction',true,20,false,false,'Imposes the sanction, including any monetary penalty.'),
  (1,'ISSUE_DIRECTIVE','Issue directive','SANCTION','REMEDIATION_MONITORING','active',20,'impose_sanction',true,20,false,false,'Issues a remedial directive to the entity.'),
  (1,'LODGE_APPEAL','Lodge appeal','SANCTION','APPEAL','appealed',30,'workflow_action',true,10,false,false,'Records an appeal lodged against the enforcement decision.'),
  (1,'RECORD_OBLIGATION','Record obligation','REMEDIATION_MONITORING','REMEDIATION_MONITORING',NULL,10,'edit',true,10,false,false,'Adds a compliance obligation to be monitored.'),
  (1,'REVIEW_REMEDIATION','Review remediation','REMEDIATION_MONITORING','REMEDIATION_MONITORING',NULL,20,'workflow_action',true,10,false,false,'Records the outcome of a remediation review.'),
  (1,'RECORD_PAYMENT','Record penalty payment','REMEDIATION_MONITORING','REMEDIATION_MONITORING',NULL,30,'edit',false,0,false,false,'Records a payment or governed waiver against the monetary penalty.'),
  (1,'LODGE_APPEAL','Lodge appeal','REMEDIATION_MONITORING','APPEAL','appealed',40,'workflow_action',true,10,false,false,'Records an appeal lodged against the enforcement decision.'),
  (1,'CLOSE','Close case','REMEDIATION_MONITORING','CLOSED','closed',50,'close',true,20,false,false,'Closes the case once mandatory obligations are discharged.'),
  (1,'DECIDE_APPEAL','Decide appeal','APPEAL','REMEDIATION_MONITORING',NULL,10,'decide',true,20,false,true,'Records the appeal outcome and its effect. The original decision is preserved.')
ON CONFLICT (version, action_code, from_stage) DO UPDATE
  SET label = EXCLUDED.label, to_stage = EXCLUDED.to_stage, to_status = EXCLUDED.to_status,
      seq = EXCLUDED.seq, permission_action = EXCLUDED.permission_action,
      requires_rationale = EXCLUDED.requires_rationale, min_rationale_length = EXCLUDED.min_rationale_length,
      requires_evidence = EXCLUDED.requires_evidence, requires_maker_checker = EXCLUDED.requires_maker_checker,
      description = EXCLUDED.description;
