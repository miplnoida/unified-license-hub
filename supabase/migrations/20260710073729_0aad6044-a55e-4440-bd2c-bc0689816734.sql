
DO $mc$
DECLARE
  reg_id uuid;
  lic_ids uuid[];
  lic1 uuid; lic2 uuid; lic3 uuid; lic4 uuid; lic5 uuid;
  cat_missell uuid; cat_unfair uuid; cat_disclose uuid; cat_complaint uuid;
  cat_privacy uuid; cat_vuln uuid; cat_fees uuid; cat_advert uuid; cat_sales uuid;
  ch_web uuid; ch_branch uuid; ch_call uuid; ch_agent uuid; ch_broker uuid; ch_mobile uuid;
  prod_ploan uuid; prod_mort uuid; prod_cc uuid; prod_sav uuid;
  prod_motor uuid; prod_life uuid; prod_health uuid; prod_invest uuid;
  prod_pension uuid; prod_remit uuid; prod_wallet uuid; prod_bloan uuid;
  ct_missell uuid; ct_unfair uuid; ct_service uuid; ct_disclose uuid;
  ct_fraud uuid; ct_privacy uuid; ct_advert uuid; ct_vuln uuid;
  rule1 uuid; rule2 uuid; rule3 uuid;
  admin_id uuid;
  inv1 uuid; inv2 uuid; inv3 uuid;
  tr1 uuid; tr2 uuid;
  find1a uuid; find1b uuid; find2a uuid;
  tra1 uuid; tra2 uuid; tra3 uuid; tra4 uuid;
BEGIN
  SELECT id INTO reg_id FROM regulators ORDER BY created_at LIMIT 1;
  SELECT id INTO admin_id FROM profiles WHERE full_name ILIKE 'Super Admin%' LIMIT 1;
  IF admin_id IS NULL THEN SELECT id INTO admin_id FROM profiles LIMIT 1; END IF;

  SELECT array_agg(id ORDER BY name) INTO lic_ids FROM licensees;
  lic1 := lic_ids[1]; lic2 := lic_ids[2]; lic3 := lic_ids[3]; lic4 := lic_ids[4]; lic5 := lic_ids[5];

  SELECT id INTO cat_missell FROM conduct_risk_categories WHERE name='Mis-selling' LIMIT 1;
  SELECT id INTO cat_unfair FROM conduct_risk_categories WHERE name='Unfair Terms' LIMIT 1;
  SELECT id INTO cat_disclose FROM conduct_risk_categories WHERE name='Disclosure Failure' LIMIT 1;
  SELECT id INTO cat_complaint FROM conduct_risk_categories WHERE name='Complaint Handling' LIMIT 1;
  SELECT id INTO cat_privacy FROM conduct_risk_categories WHERE name='Data Privacy' LIMIT 1;
  SELECT id INTO cat_vuln FROM conduct_risk_categories WHERE name='Vulnerable Customer Treatment' LIMIT 1;
  SELECT id INTO cat_fees FROM conduct_risk_categories WHERE name='Fees & Charges' LIMIT 1;
  SELECT id INTO cat_advert FROM conduct_risk_categories WHERE name='Advertising & Marketing' LIMIT 1;
  SELECT id INTO cat_sales FROM conduct_risk_categories WHERE name='Sales Conduct' LIMIT 1;

  SELECT id INTO ch_web FROM conduct_channels WHERE name='Web / Online' LIMIT 1;
  SELECT id INTO ch_branch FROM conduct_channels WHERE name='Branch' LIMIT 1;
  SELECT id INTO ch_call FROM conduct_channels WHERE name='Call Center' LIMIT 1;
  SELECT id INTO ch_agent FROM conduct_channels WHERE name='Tied Agent' LIMIT 1;
  SELECT id INTO ch_broker FROM conduct_channels WHERE name='Broker' LIMIT 1;
  SELECT id INTO ch_mobile FROM conduct_channels WHERE name='Mobile App' LIMIT 1;

  INSERT INTO conduct_products (regulator_id, code, name, description, active) VALUES
    (reg_id,'PROD-PLOAN','Personal Loan','Unsecured personal loans to retail customers', true),
    (reg_id,'PROD-MORT','Mortgage','Residential mortgages', true),
    (reg_id,'PROD-CC','Credit Card','Consumer credit cards', true),
    (reg_id,'PROD-SAV','Savings Account','Retail deposit savings accounts', true),
    (reg_id,'PROD-MOTOR','Motor Insurance','Third-party & comprehensive motor cover', true),
    (reg_id,'PROD-LIFE','Life Insurance','Term & whole-of-life insurance', true),
    (reg_id,'PROD-HEALTH','Health Insurance','Individual & group medical cover', true),
    (reg_id,'PROD-INVEST','Investment Fund','Retail collective investment schemes', true),
    (reg_id,'PROD-PENSION','Pension','Defined-contribution retirement products', true),
    (reg_id,'PROD-REMIT','Money Transfer','Domestic & cross-border remittance', true),
    (reg_id,'PROD-WALLET','Digital Wallet','Electronic money & digital wallet accounts', true),
    (reg_id,'PROD-BLOAN','Business Loan','SME lending products', true)
  ON CONFLICT (regulator_id, code) DO NOTHING;

  SELECT id INTO prod_ploan FROM conduct_products WHERE code='PROD-PLOAN' LIMIT 1;
  SELECT id INTO prod_mort FROM conduct_products WHERE code='PROD-MORT' LIMIT 1;
  SELECT id INTO prod_cc FROM conduct_products WHERE code='PROD-CC' LIMIT 1;
  SELECT id INTO prod_sav FROM conduct_products WHERE code='PROD-SAV' LIMIT 1;
  SELECT id INTO prod_motor FROM conduct_products WHERE code='PROD-MOTOR' LIMIT 1;
  SELECT id INTO prod_life FROM conduct_products WHERE code='PROD-LIFE' LIMIT 1;
  SELECT id INTO prod_health FROM conduct_products WHERE code='PROD-HEALTH' LIMIT 1;
  SELECT id INTO prod_invest FROM conduct_products WHERE code='PROD-INVEST' LIMIT 1;
  SELECT id INTO prod_pension FROM conduct_products WHERE code='PROD-PENSION' LIMIT 1;
  SELECT id INTO prod_remit FROM conduct_products WHERE code='PROD-REMIT' LIMIT 1;
  SELECT id INTO prod_wallet FROM conduct_products WHERE code='PROD-WALLET' LIMIT 1;
  SELECT id INTO prod_bloan FROM conduct_products WHERE code='PROD-BLOAN' LIMIT 1;

  INSERT INTO complaint_types (name, description, sla_days, is_active)
  SELECT v.name, v.descr, v.sla, true FROM (VALUES
    ('Mis-selling','Product sold without adequate suitability assessment', 20),
    ('Unfair Charges','Fees or penalties applied contrary to contract terms', 25),
    ('Poor Service','Delays, rudeness, or failure to respond to customer', 30),
    ('Disclosure Failure','Key features, risks or costs not disclosed', 20),
    ('Fraud / Unauthorised Transaction','Suspected fraud or unauthorised account activity', 10),
    ('Data Privacy Breach','Personal data disclosed, lost or misused', 15),
    ('Misleading Advertising','Marketing communications contain false or misleading claims', 25),
    ('Vulnerable Customer Treatment','Alleged unfair treatment of a vulnerable consumer', 15)
  ) AS v(name, descr, sla)
  WHERE NOT EXISTS (SELECT 1 FROM complaint_types ct WHERE ct.name = v.name);

  SELECT id INTO ct_missell FROM complaint_types WHERE name='Mis-selling' LIMIT 1;
  SELECT id INTO ct_unfair FROM complaint_types WHERE name='Unfair Charges' LIMIT 1;
  SELECT id INTO ct_service FROM complaint_types WHERE name='Poor Service' LIMIT 1;
  SELECT id INTO ct_disclose FROM complaint_types WHERE name='Disclosure Failure' LIMIT 1;
  SELECT id INTO ct_fraud FROM complaint_types WHERE name='Fraud / Unauthorised Transaction' LIMIT 1;
  SELECT id INTO ct_privacy FROM complaint_types WHERE name='Data Privacy Breach' LIMIT 1;
  SELECT id INTO ct_advert FROM complaint_types WHERE name='Misleading Advertising' LIMIT 1;
  SELECT id INTO ct_vuln FROM complaint_types WHERE name='Vulnerable Customer Treatment' LIMIT 1;

  INSERT INTO conduct_triage_rules (regulator_id, name, description, active, priority_order, match_mode, conditions, outputs)
  SELECT reg_id, v.name, v.descr, true, v.prio, v.mode, v.cond::jsonb, v.out::jsonb FROM (VALUES
    ('Vulnerable + High Financial Impact','Escalate any vulnerable-customer complaint with monetary_impact > 50k to Enforcement.', 10, 'all',
      '[{"field":"vulnerability_indicator","op":"=","value":true},{"field":"monetary_impact","op":">","value":50000}]',
      '{"severity":"critical","priority":"p1","assigned_team":"Enforcement","sla_days":5}'),
    ('Fraud / Unauthorised Transaction','Fraud allegations route to Investigations at P1.', 20, 'any',
      '[{"field":"conduct_risk_category","op":"=","value":"Fraud / Unauthorised Transaction"},{"field":"complaint_type","op":"=","value":"Fraud / Unauthorised Transaction"}]',
      '{"severity":"high","priority":"p1","assigned_team":"Investigations","sla_days":7}'),
    ('Repeat Complainant','Complainants with 3+ complaints in 90 days against same entity.', 30, 'all',
      '[{"field":"repeat_complaint_count","op":">=","value":3}]',
      '{"severity":"high","priority":"p2","assigned_team":"Investigations","sla_days":15}'),
    ('Mis-selling on Insurance','Mis-selling on Life/Motor/Health products.', 40, 'all',
      '[{"field":"conduct_risk_category","op":"=","value":"Mis-selling"},{"field":"product_category","op":"in","value":["Life Insurance","Motor Insurance","Health Insurance"]}]',
      '{"severity":"high","priority":"p2","assigned_team":"Conduct Ops","sla_days":20}'),
    ('Fees & Charges Small Value','Fees complaints under $10k.', 50, 'all',
      '[{"field":"conduct_risk_category","op":"=","value":"Fees & Charges"},{"field":"monetary_impact","op":"<","value":10000}]',
      '{"severity":"medium","priority":"p3","assigned_team":"Conduct Ops","sla_days":30}'),
    ('Default Catch-All','Fallback rule for unmatched complaints.', 999, 'any',
      '[{"field":"complaint_type","op":"!=","value":""}]',
      '{"severity":"medium","priority":"p3","assigned_team":"Conduct Ops","sla_days":30}')
  ) AS v(name, descr, prio, mode, cond, out)
  WHERE NOT EXISTS (SELECT 1 FROM conduct_triage_rules tr WHERE tr.name = v.name);

  INSERT INTO conduct_monitoring_rules (name, description, scope, rule_type, definition, frequency, risk_delta, active)
  SELECT v.name, v.descr, v.scope, v.rt, v.def::jsonb, v.freq, v.rd, true FROM (VALUES
    ('Repeat Complaints Post-Remediation','Flag entities receiving >=2 new complaints within 60 days after last resolved complaint.', 'entity', 'metric_threshold',
      '{"metric":"post_remediation_complaint_count","window_days":60,"threshold":2,"op":">="}', 'daily', 5),
    ('Product Concentration Spike','Flag any product with >=5 open complaints in a rolling 30-day window.', 'product', 'metric_threshold',
      '{"metric":"open_complaints_rolling","window_days":30,"threshold":5,"op":">="}', 'daily', 3),
    ('Channel Concentration','Flag any channel with >=8 complaints in a rolling 90-day window.', 'channel', 'metric_threshold',
      '{"metric":"complaints_by_channel","window_days":90,"threshold":8,"op":">="}', 'weekly', 2)
  ) AS v(name, descr, scope, rt, def, freq, rd)
  WHERE NOT EXISTS (SELECT 1 FROM conduct_monitoring_rules mr WHERE mr.name = v.name);

  SELECT id INTO rule1 FROM conduct_monitoring_rules WHERE name='Repeat Complaints Post-Remediation' LIMIT 1;
  SELECT id INTO rule2 FROM conduct_monitoring_rules WHERE name='Product Concentration Spike' LIMIT 1;
  SELECT id INTO rule3 FROM conduct_monitoring_rules WHERE name='Channel Concentration' LIMIT 1;

  WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn
    FROM complaints WHERE licensee_id IS NULL
  )
  UPDATE complaints c
  SET licensee_id = CASE (n.rn % 3) WHEN 0 THEN lic1 WHEN 1 THEN lic2 ELSE lic3 END,
      regulator_id = COALESCE(c.regulator_id, reg_id),
      product_id = COALESCE(c.product_id, prod_ploan),
      channel_id = COALESCE(c.channel_id, ch_web),
      conduct_risk_category_id = COALESCE(c.conduct_risk_category_id, cat_complaint)
  FROM numbered n WHERE n.id = c.id;

  IF NOT EXISTS (SELECT 1 FROM complaints WHERE subject LIKE '[MC-SEED]%') THEN
    INSERT INTO complaints (subject, description, status, severity, priority, assigned_team, licensee_id, regulator_id,
                            complaint_type_id, conduct_risk_category_id, product_id, channel_id, customer_type,
                            vulnerability_indicator, sla_days, sla_due_at, acknowledged_at, resolved_at, created_at, updated_at,
                            triage_source, triage_evaluated_at)
    VALUES
      ('[MC-SEED] Mis-selling of whole-of-life policy','Customer alleges suitability not assessed prior to sale.','resolved','high','p2','Conduct Ops',lic1,reg_id,ct_missell,cat_missell,prod_life,ch_agent,'retail',false,20,now()-interval '400 days',now()-interval '440 days'+interval '2 days',now()-interval '410 days',now()-interval '440 days',now()-interval '410 days','auto',now()-interval '440 days'+interval '1 hour'),
      ('[MC-SEED] Unauthorised credit card transactions','Multiple contactless transactions disputed as fraudulent.','closed','critical','p1','Investigations',lic1,reg_id,ct_fraud,cat_complaint,prod_cc,ch_call,'retail',false,7,now()-interval '365 days',now()-interval '395 days'+interval '2 days',now()-interval '380 days',now()-interval '395 days',now()-interval '380 days','auto',now()-interval '395 days'+interval '1 hour'),
      ('[MC-SEED] Undisclosed FX fees on remittance','Actual FX spread higher than advertised.','resolved','medium','p3','Conduct Ops',lic2,reg_id,ct_disclose,cat_disclose,prod_remit,ch_web,'retail',false,20,now()-interval '340 days',now()-interval '370 days'+interval '2 days',now()-interval '350 days',now()-interval '370 days',now()-interval '350 days','auto',now()-interval '370 days'+interval '1 hour'),
      ('[MC-SEED] Motor insurance claim declined without explanation','Claim declined citing exclusion never disclosed.','resolved','high','p2','Conduct Ops',lic2,reg_id,ct_disclose,cat_disclose,prod_motor,ch_broker,'retail',false,20,now()-interval '300 days',now()-interval '330 days'+interval '2 days',now()-interval '310 days',now()-interval '330 days',now()-interval '310 days','auto',now()-interval '330 days'+interval '1 hour'),
      ('[MC-SEED] Digital wallet fees not disclosed at signup','Monthly maintenance fee never disclosed at signup.','closed','medium','p3','Conduct Ops',lic3,reg_id,ct_unfair,cat_fees,prod_wallet,ch_mobile,'retail',false,25,now()-interval '260 days',now()-interval '290 days'+interval '2 days',now()-interval '275 days',now()-interval '290 days',now()-interval '275 days','auto',now()-interval '290 days'+interval '1 hour'),
      ('[MC-SEED] Aggressive collections practices','Collections calls outside permitted hours.','closed','high','p2','Conduct Ops',lic3,reg_id,ct_service,cat_complaint,prod_ploan,ch_call,'retail',false,20,now()-interval '220 days',now()-interval '250 days'+interval '2 days',now()-interval '235 days',now()-interval '250 days',now()-interval '235 days','auto',now()-interval '250 days'+interval '1 hour'),
      ('[MC-SEED] Advisor pressured vulnerable customer','Adult with cognitive impairment sold complex investment product.','resolved','critical','p1','Enforcement',lic1,reg_id,ct_vuln,cat_vuln,prod_invest,ch_branch,'vulnerable',true,5,now()-interval '200 days',now()-interval '215 days'+interval '2 days',now()-interval '210 days',now()-interval '215 days',now()-interval '210 days','auto',now()-interval '215 days'+interval '1 hour'),
      ('[MC-SEED] Misleading health insurance advert','Advert claimed 100% coverage; policy has significant exclusions.','resolved','medium','p3','Conduct Ops',lic4,reg_id,ct_advert,cat_advert,prod_health,ch_web,'retail',false,25,now()-interval '170 days',now()-interval '195 days'+interval '2 days',now()-interval '180 days',now()-interval '195 days',now()-interval '180 days','auto',now()-interval '195 days'+interval '1 hour'),
      ('[MC-SEED] Pension transfer suitability failure','Transfer effected without documenting analysis.','under_investigation','high','p2','Investigations',lic4,reg_id,ct_missell,cat_missell,prod_pension,ch_agent,'retail',false,20,now()+interval '5 days',now()-interval '35 days'+interval '2 days',null,now()-interval '35 days',now()-interval '20 days','auto',now()-interval '35 days'+interval '1 hour'),
      ('[MC-SEED] Data leak - customer statement emailed to wrong recipient','Personal data disclosed to unrelated third party.','under_investigation','high','p2','Investigations',lic1,reg_id,ct_privacy,cat_privacy,prod_sav,ch_web,'retail',false,15,now()+interval '2 days',now()-interval '20 days'+interval '2 days',null,now()-interval '20 days',now()-interval '15 days','auto',now()-interval '20 days'+interval '1 hour'),
      ('[MC-SEED] Credit card fee dispute','Late payment fee applied despite auto-debit set up.','submitted','low','p4','Conduct Ops',lic5,reg_id,ct_unfair,cat_fees,prod_cc,ch_mobile,'retail',false,30,now()+interval '25 days',now()-interval '5 days'+interval '2 days',null,now()-interval '5 days',now()-interval '5 days','auto',now()-interval '5 days'+interval '1 hour'),
      ('[MC-SEED] Cross-border remittance failure','Funds sent 14 days ago never delivered.','submitted','high','p2','Investigations',lic2,reg_id,ct_service,cat_complaint,prod_remit,ch_web,'retail',false,20,now()+interval '17 days',now()-interval '3 days'+interval '2 days',null,now()-interval '3 days',now()-interval '3 days','auto',now()-interval '3 days'+interval '1 hour'),
      ('[MC-SEED] Broker sold unsuitable structured note','Retail investor sold complex product without appropriate KYC.','submitted','high','p2','Conduct Ops',lic3,reg_id,ct_missell,cat_missell,prod_invest,ch_broker,'retail',false,20,now()+interval '18 days',now()-interval '2 days'+interval '2 days',null,now()-interval '2 days',now()-interval '2 days','auto',now()-interval '2 days'+interval '1 hour'),
      ('[MC-SEED] Repeat complaint on aggressive telesales','Third complaint against same entity in 60 days.','submitted','high','p2','Investigations',lic3,reg_id,ct_service,cat_sales,prod_ploan,ch_call,'retail',false,15,now()+interval '13 days',now()-interval '1 day'+interval '2 days',null,now()-interval '1 day',now()-interval '1 day','auto',now()-interval '1 day'+interval '1 hour'),
      ('[MC-SEED] Vulnerable customer fee reversal request','Elderly customer charged multiple overdraft fees.','submitted','critical','p1','Enforcement',lic4,reg_id,ct_vuln,cat_vuln,prod_sav,ch_branch,'vulnerable',true,5,now()+interval '4 days',now()-interval '1 day'+interval '2 days',null,now()-interval '1 day',now()-interval '1 day','auto',now()-interval '1 day'+interval '1 hour');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM conduct_investigations WHERE code LIKE 'INV-SEED-%') THEN
    INSERT INTO conduct_investigations (code, source_type, source_id, licensee_id, product_id, allegation, priority, severity, status, opened_by, due_date, metadata) VALUES
      ('INV-SEED-001','complaint',(SELECT id FROM complaints WHERE subject='[MC-SEED] Pension transfer suitability failure' LIMIT 1),lic4,prod_pension,'Pension transfer suitability failure - investigate advisor sales practices.','high','high','open',admin_id,current_date+30,jsonb_build_object('seed_tag','script4')),
      ('INV-SEED-002','complaint',(SELECT id FROM complaints WHERE subject='[MC-SEED] Data leak - customer statement emailed to wrong recipient' LIMIT 1),lic1,prod_sav,'Personal data breach - assess controls and remediation.','high','high','evidence_gathering',admin_id,current_date+20,jsonb_build_object('seed_tag','script4')),
      ('INV-SEED-003','thematic',null,lic3,prod_ploan,'Aggressive collections practices - thematic escalation.','medium','high','opened',admin_id,current_date+45,jsonb_build_object('seed_tag','script4'));
  END IF;

  SELECT id INTO inv1 FROM conduct_investigations WHERE code='INV-SEED-001' LIMIT 1;
  SELECT id INTO inv2 FROM conduct_investigations WHERE code='INV-SEED-002' LIMIT 1;
  SELECT id INTO inv3 FROM conduct_investigations WHERE code='INV-SEED-003' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM conduct_evidence WHERE metadata->>'seed_tag'='script4') THEN
    INSERT INTO conduct_evidence (title, evidence_type, description, source, restricted, confidentiality_level, investigation_id, entity_id, uploaded_by, metadata) VALUES
      ('Advisor sales file - Client 8721','document','Suitability questionnaire on record; no rationale for pension transfer.','licensee submission',false,'internal',inv1,lic4,admin_id,jsonb_build_object('seed_tag','script4')),
      ('Recorded advisor phone call - 12 Mar','audio','30-minute call between advisor and complainant; pressure tactics evident.','licensee submission',true,'restricted',inv1,lic4,admin_id,jsonb_build_object('seed_tag','script4')),
      ('Compliance sign-off log','document','Compliance officer never reviewed the file.','internal audit',true,'restricted',inv1,lic4,admin_id,jsonb_build_object('seed_tag','script4')),
      ('Email trail - mis-sent statement','document','Original email showing wrong recipient address.','complainant',false,'internal',inv2,lic1,admin_id,jsonb_build_object('seed_tag','script4')),
      ('DLP incident report','document','Data Loss Prevention alert & remediation timeline.','licensee submission',true,'confidential',inv2,lic1,admin_id,jsonb_build_object('seed_tag','script4')),
      ('Collections call recordings sample (10)','audio','Sample of 10 calls placed outside permitted hours.','regulator inspection',true,'restricted',inv3,lic3,admin_id,jsonb_build_object('seed_tag','script4')),
      ('Collections policy vs practice memo','document','Analysis of gap between written policy and observed calls.','regulator analysis',false,'internal',inv3,lic3,admin_id,jsonb_build_object('seed_tag','script4'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM thematic_reviews WHERE code LIKE 'THM-SEED-%') THEN
    INSERT INTO thematic_reviews (code, title, description, regulator_id, lead_officer_id, risk_category_id, status, scope_start, scope_end, methodology, hypothesis, opened_at, created_by) VALUES
      ('THM-SEED-01','Mis-selling of Credit Life Insurance','Cross-entity review of credit life insurance sales practices bundled with personal loans.',reg_id,admin_id,cat_missell,'evidence_collection',current_date-90,current_date+30,
        jsonb_build_object('sample_size',100,'per_entity',true,'techniques',array['file review','customer interviews','advisor training review']),
        'Bundled credit life insurance is being sold without adequate suitability assessment.',now()-interval '90 days',admin_id),
      ('THM-SEED-02','Digital Wallet Fee Disclosure Sweep','Review of e-money and digital wallet fee disclosure at point of sign-up.',reg_id,admin_id,cat_disclose,'analysis',current_date-60,current_date+15,
        jsonb_build_object('techniques',array['mystery shopping','pre-contract disclosure review','benchmark against Consumer Protection Code']),
        'Digital wallet providers are not clearly disclosing monthly maintenance and inactivity fees.',now()-interval '60 days',admin_id);
  END IF;

  SELECT id INTO tr1 FROM thematic_reviews WHERE code='THM-SEED-01' LIMIT 1;
  SELECT id INTO tr2 FROM thematic_reviews WHERE code='THM-SEED-02' LIMIT 1;

  INSERT INTO thematic_review_entities (review_id, licensee_id, inclusion_reason, sample_weight, added_by) VALUES
    (tr1,lic1,'High-volume credit life issuer',1.0,admin_id),
    (tr1,lic2,'Recent supervisory concerns raised',1.5,admin_id),
    (tr1,lic3,'Bundled sales model',1.0,admin_id),
    (tr2,lic1,'Largest e-money issuer',1.5,admin_id),
    (tr2,lic4,'New digital wallet launch',1.0,admin_id),
    (tr2,lic5,'Growth in complaint volumes',1.0,admin_id)
  ON CONFLICT (review_id, licensee_id) DO NOTHING;

  INSERT INTO thematic_review_products (review_id, product_id)
  SELECT tr1, p FROM (VALUES (prod_life),(prod_ploan)) v(p)
  WHERE NOT EXISTS (SELECT 1 FROM thematic_review_products x WHERE x.review_id=tr1 AND x.product_id=v.p);
  INSERT INTO thematic_review_products (review_id, product_id)
  SELECT tr2, p FROM (VALUES (prod_wallet),(prod_remit)) v(p)
  WHERE NOT EXISTS (SELECT 1 FROM thematic_review_products x WHERE x.review_id=tr2 AND x.product_id=v.p);

  IF NOT EXISTS (SELECT 1 FROM thematic_review_findings WHERE review_id IN (tr1, tr2)) THEN
    INSERT INTO thematic_review_findings (review_id, licensee_id, severity, title, detail, root_cause, evidence_summary, status, issued_at, issued_by, created_by) VALUES
      (tr1,lic1,'high','Suitability documentation missing in 42% of sampled files','Retail sample n=100; 42 files lacked suitability rationale.','Advisor incentives skewed toward volume over suitability.','Sample review, advisor interviews, call recordings.','issued',now()-interval '10 days',admin_id,admin_id),
      (tr1,lic2,'medium','Advisor training inadequate on vulnerable customers','Training log shows 22% of active advisors have no vulnerable-customer module completion.','Training program not mandatory since 2022 refresh.','Training LMS report, advisor register.','issued',now()-interval '8 days',admin_id,admin_id),
      (tr2,lic1,'high','Monthly maintenance fee not disclosed pre-contract','Sign-up screens do not show recurring fee before account opening.','UX redesign in 2024 removed fee disclosure card from flow.','Mystery-shop screen captures, product T&Cs.','issued',now()-interval '5 days',admin_id,admin_id);
  END IF;

  SELECT id INTO find1a FROM thematic_review_findings WHERE review_id=tr1 AND licensee_id=lic1 LIMIT 1;
  SELECT id INTO find1b FROM thematic_review_findings WHERE review_id=tr1 AND licensee_id=lic2 LIMIT 1;
  SELECT id INTO find2a FROM thematic_review_findings WHERE review_id=tr2 AND licensee_id=lic1 LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM thematic_review_actions WHERE review_id IN (tr1, tr2)) THEN
    INSERT INTO thematic_review_actions (review_id, finding_id, licensee_id, action_type, title, description, due_date, status, assigned_team, created_by) VALUES
      (tr1,find1a,lic1,'remediation','Remediate impacted customers','Contact each of the 42 impacted customers; refund premium and offer alternative cover.',current_date+60,'in_progress','Conduct Ops',admin_id),
      (tr1,find1b,lic2,'training','Mandatory advisor retraining','Complete vulnerable-customer training for all active advisors within 60 days.',current_date+60,'open','Conduct Ops',admin_id),
      (tr2,find2a,lic1,'disclosure','Reinstate fee disclosure card','Restore fee disclosure card in digital wallet sign-up flow within 30 days.',current_date+30,'open','Conduct Ops',admin_id),
      (tr2,null,lic4,'notification','Attest to fee-disclosure controls','Board-level attestation on fee-disclosure controls within 45 days.',current_date+45,'open','Conduct Ops',admin_id);
  END IF;

  SELECT id INTO tra1 FROM thematic_review_actions WHERE review_id=tr1 AND title='Remediate impacted customers' LIMIT 1;
  SELECT id INTO tra2 FROM thematic_review_actions WHERE review_id=tr1 AND title='Mandatory advisor retraining' LIMIT 1;
  SELECT id INTO tra3 FROM thematic_review_actions WHERE review_id=tr2 AND title='Reinstate fee disclosure card' LIMIT 1;
  SELECT id INTO tra4 FROM thematic_review_actions WHERE review_id=tr2 AND title='Attest to fee-disclosure controls' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM thematic_review_evidence WHERE review_id IN (tr1, tr2)) THEN
    INSERT INTO thematic_review_evidence (review_id, finding_id, source_type, source_ref, notes, collected_by) VALUES
      (tr1,find1a,'workbook','suitability-file-review-v1','Suitability file review workbook — findings from 100-file sample review.',admin_id),
      (tr2,find2a,'screenshot_pack','mystery-shop-pack-01','Mystery-shop screen capture pack — screenshots of sign-up flow with missing fee disclosure.',admin_id);
  END IF;

  -- Enrich trigger-created conduct_actions rows (linked via thematic_action_id) with seed content.
  UPDATE conduct_actions SET
    action_type='remediation', title='Customer remediation - credit life mis-selling',
    description='Refund premiums and offer replacement cover to 42 customers.',
    due_date=current_date+60, status='in_progress', assigned_team='Conduct Ops',
    outcome='Remediation in progress; 18 of 42 customers contacted.',
    completion_notes='First tranche of refunds issued 21 days ago.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('seed_tag','script4','rationale','Suitability documentation missing in 42% of sampled files.')
  WHERE thematic_action_id = tra1;

  UPDATE conduct_actions SET
    action_type='warning', title='Written warning - advisor training deficiencies',
    description='Formal written warning issued to CEO citing training deficiencies.',
    due_date=current_date-5, status='completed', assigned_team='Conduct Ops',
    outcome='Warning acknowledged by CEO; retraining plan submitted.',
    completion_notes='Written warning issued 20 days ago; response received.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('seed_tag','script4','rationale','Advisor training inadequate on vulnerable customers.')
  WHERE thematic_action_id = tra2;

  UPDATE conduct_actions SET
    action_type='sanction', title='Sanction - administrative fine $75,000',
    description='Administrative fine for failure to disclose recurring fees.',
    due_date=current_date+14, status='in_progress', assigned_team='Enforcement',
    outcome='Fine notice served; payment terms 30 days.',
    completion_notes='Fine issued under Section 14(2) Consumer Protection Code.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('seed_tag','script4','rationale','Monthly maintenance fee not disclosed pre-contract.','amount',75000)
  WHERE thematic_action_id = tra3;

  UPDATE conduct_actions SET
    action_type='public_censure', title='Public censure - digital wallet fee disclosure',
    description='Public censure notice to be published on regulator website.',
    due_date=current_date+7, status='open', assigned_team='Enforcement',
    completion_notes='Public censure draft under legal review.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('seed_tag','script4','rationale','Repeated failure to disclose recurring fees materially harmed consumers.')
  WHERE thematic_action_id = tra4;

  -- Non-thematic conduct actions (complaint/investigation sourced) — insert only if absent.
  IF NOT EXISTS (SELECT 1 FROM conduct_actions WHERE metadata->>'seed_tag'='script4' AND source_module='complaint') THEN
    INSERT INTO conduct_actions (source_module, source_id, entity_id, product_id, action_type, title, description, due_date, status, assigned_team, thematic_action_id, outcome, completion_notes, created_by, metadata) VALUES
      ('complaint',(SELECT id FROM complaints WHERE subject='[MC-SEED] Advisor pressured vulnerable customer' LIMIT 1),lic1,prod_invest,'directions_letter','Directions letter - vulnerable customer sales','Directions letter requiring cessation of sales to vulnerable customers pending review.',current_date-20,'completed','Enforcement',null,'Directions complied with; sales suspended.','Directions issued 45 days ago and complied with in 5 days.',admin_id,jsonb_build_object('seed_tag','script4','rationale','Vulnerable customer sold complex product under pressure.')),
      ('investigation',inv2,lic1,prod_sav,'undertaking','Undertaking - data privacy controls','Formal undertaking to strengthen DLP controls and staff training.',current_date+30,'in_progress','Conduct Ops',null,'Undertaking signed; independent assurance due in 90 days.','Undertaking executed; quarterly reporting required.',admin_id,jsonb_build_object('seed_tag','script4','rationale','Personal data disclosed to wrong recipient; DLP gap identified.'));
  END IF;

  INSERT INTO notification_dispatch_log (event_key, entity_type, entity_id, channel, dedupe_key, status, subject, payload, sent_at, created_at)
  SELECT 'conduct.action.issued','conduct_action',ca.id::text,'email',
         'seed-script4-notif-'||ca.id::text,'sent',
         'Supervisory action issued: '||ca.title,
         jsonb_build_object('action_type',ca.action_type,'entity_id',ca.entity_id,'title',ca.title,'seed_tag','script4'),
         ca.created_at+interval '1 hour',ca.created_at+interval '1 hour'
  FROM conduct_actions ca
  WHERE ca.metadata->>'seed_tag' = 'script4'
  ON CONFLICT (dedupe_key) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM conduct_monitoring_rule_runs WHERE summary->>'seed_tag'='script4') THEN
    INSERT INTO conduct_monitoring_rule_runs (rule_id, started_at, completed_at, status, matched_count, alerts_created, summary) VALUES
      (rule1,now()-interval '1 day',now()-interval '1 day'+interval '3 seconds','completed',2,2,jsonb_build_object('seed_tag','script4','window_days',60,'threshold',2)),
      (rule2,now()-interval '1 day',now()-interval '1 day'+interval '4 seconds','completed',3,1,jsonb_build_object('seed_tag','script4','window_days',30,'threshold',5)),
      (rule3,now()-interval '3 days',now()-interval '3 days'+interval '5 seconds','completed',1,0,jsonb_build_object('seed_tag','script4','window_days',90,'threshold',8));

    INSERT INTO conduct_monitoring_results (rule_id, entity_id, product_id, matched, metrics, risk_delta_applied, notes) VALUES
      (rule1,lic1,prod_life,true,jsonb_build_object('post_remediation_complaint_count',3,'window_days',60),5,'3 new complaints within 60 days after last resolved.'),
      (rule1,lic3,prod_ploan,true,jsonb_build_object('post_remediation_complaint_count',2,'window_days',60),5,'2 repeat complaints post-remediation.'),
      (rule2,null,prod_cc,true,jsonb_build_object('open_complaints_rolling',6,'window_days',30),3,'Credit card complaints spiked to 6 in 30 days.'),
      (rule2,null,prod_wallet,true,jsonb_build_object('open_complaints_rolling',5,'window_days',30),3,'Digital wallet complaints at threshold.'),
      (rule3,null,null,true,jsonb_build_object('channel','Call Center','complaints_by_channel',9,'window_days',90),2,'Call-centre channel over 90-day threshold.');
  END IF;

  RAISE NOTICE 'SCRIPT 4 seed complete.';
END
$mc$;
