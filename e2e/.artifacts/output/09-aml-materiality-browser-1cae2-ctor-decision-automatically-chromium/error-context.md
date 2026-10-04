# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-aml-materiality-browser-journey.spec.ts >> AML-CLOSE-03A browser journey (TEST package) >> missing facts fail closed; recording them refreshes the factor decision automatically
- Location: e2e/cert-v2/09-aml-materiality-browser-journey.spec.ts:73:3

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "PENDING_INFORMATION"

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=f1e3]:
    - complementary [ref=f1e4]:
      - generic [ref=f1e5]:
        - img "OLRAS" [ref=f1e7]
        - button [ref=f1e8] [cursor=pointer]
      - navigation [ref=f1e12]:
        - generic [ref=f1e14]:
          - generic [ref=f1e15]:
            - button "Home" [expanded] [ref=f1e16] [cursor=pointer]
            - generic [ref=f1e26]:
              - link "Home" [ref=f1e27] [cursor=pointer]:
                - /url: /dashboard
              - link "Help & User Manual" [ref=f1e33] [cursor=pointer]:
                - /url: /help/user-manual
          - generic [ref=f1e39]:
            - button "My Work" [ref=f1e40] [cursor=pointer]
            - link "Notifications" [ref=f1e49] [cursor=pointer]:
              - /url: /notifications
          - generic [ref=f1e55]:
            - button "Supervision" [expanded] [ref=f1e56] [cursor=pointer]
            - generic [ref=f1e66]:
              - link "Continuous Monitoring" [ref=f1e67] [cursor=pointer]:
                - /url: /supervision/monitoring
              - link "Portfolio & Sector Supervision" [ref=f1e77] [cursor=pointer]:
                - /url: /supervision/portfolio
              - link "Portfolio & Thematic Intelligence" [ref=f1e84] [cursor=pointer]:
                - /url: /supervision/portfolio-intelligence
              - generic [ref=f1e92]:
                - button "Supervisory Planning" [ref=f1e93] [cursor=pointer]
                - generic [ref=f1e102]:
                  - link "Supervisory Plans" [ref=f1e103] [cursor=pointer]:
                    - /url: /supervision/plans
                  - link "Risk Heatmap" [ref=f1e111] [cursor=pointer]:
                    - /url: /supervision/risk
                  - link "Breach Inbox" [ref=f1e116] [cursor=pointer]:
                    - /url: /supervision/breaches
                  - link "Early Warning Indicators" [ref=f1e121] [cursor=pointer]:
                    - /url: /supervision/early-warnings
                  - link "Inspections" [ref=f1e131] [cursor=pointer]:
                    - /url: /inspections
                  - link "Inspection Calendar" [ref=f1e138] [cursor=pointer]:
                    - /url: /inspections/schedule
              - generic [ref=f1e144]:
                - button "AML/CFT" [expanded] [ref=f1e145] [cursor=pointer]
                - generic [ref=f1e155]:
                  - link "AML/CFT Overview" [ref=f1e156] [cursor=pointer]:
                    - /url: /supervision/aml
                  - link "AML/CFT Work Queue" [ref=f1e164] [cursor=pointer]:
                    - /url: /supervision/aml/work-queue
                  - link "Supervised Entities" [ref=f1e170] [cursor=pointer]:
                    - /url: /supervision/aml/entities
                  - link "Risk Assessments" [ref=f1e177] [cursor=pointer]:
                    - /url: /supervision/aml/assessments
                  - link "Risk Heatmap" [ref=f1e184] [cursor=pointer]:
                    - /url: /supervision/aml/heatmap
                  - link "Examinations" [ref=f1e190] [cursor=pointer]:
                    - /url: /supervision/aml/examinations
                  - link "Findings & Remediation" [ref=f1e197] [cursor=pointer]:
                    - /url: /supervision/aml/findings
              - generic [ref=f1e202]:
                - button "Prudential" [ref=f1e203] [cursor=pointer]
                - generic [ref=f1e210]:
                  - link "Overview" [ref=f1e211] [cursor=pointer]:
                    - /url: /prudential/dashboard
                  - link "Work Queue" [ref=f1e219] [cursor=pointer]:
                    - /url: /prudential/work
                  - link "Supervised Entities" [ref=f1e225] [cursor=pointer]:
                    - /url: /prudential/entities
                  - link "Financial Groups" [ref=f1e232] [cursor=pointer]:
                    - /url: /prudential/groups
                  - link "Assessments" [ref=f1e240] [cursor=pointer]:
                    - /url: /prudential/assessments
                  - link "Onsite Examinations" [ref=f1e247] [cursor=pointer]:
                    - /url: /prudential/examinations
                  - link "Actions Ledger" [ref=f1e253] [cursor=pointer]:
                    - /url: /prudential/actions
                  - link "Early Warnings" [ref=f1e259] [cursor=pointer]:
                    - /url: /prudential/escalations
                  - link "Stress Indicators" [ref=f1e264] [cursor=pointer]:
                    - /url: /prudential/stress-indicators
                  - link "Team Performance" [ref=f1e269] [cursor=pointer]:
                    - /url: /supervision/team-performance
    - generic [ref=f1e277]:
      - banner [ref=f1e278]:
        - button "Search navigation" [ref=f1e280] [cursor=pointer]:
          - generic [ref=f1e284]: Search...
          - generic [ref=f1e285]: ⌘K
        - generic [ref=f1e286]:
          - button "Notifications, 255 unread" [ref=f1e287] [cursor=pointer]:
            - generic [ref=f1e288]: 99+
          - button "C Certification - AML/CFT Supervision Officer Applicant" [ref=f1e289] [cursor=pointer]:
            - generic [ref=f1e290]: C
            - generic [ref=f1e292]:
              - paragraph [ref=f1e293]: Certification - AML/CFT Supervision Officer
              - paragraph [ref=f1e294]: Applicant
      - main [ref=f1e295]:
        - generic [ref=f1e296]:
          - navigation "breadcrumb" [ref=f1e297]:
            - list [ref=f1e298]:
              - listitem [ref=f1e299]:
                - link "Home" [ref=f1e300] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f1e301]
              - listitem [ref=f1e304]:
                - link "AML/CFT supervision" [ref=f1e305] [cursor=pointer]:
                  - /url: /supervision/aml
              - listitem [ref=f1e306]
              - listitem [ref=f1e309]:
                - link "Assessments" [ref=f1e310] [cursor=pointer]:
                  - /url: /supervision/aml/assessments
              - listitem [ref=f1e311]
              - listitem [ref=f1e314]:
                - link "SUP-AML_CFT-2026-00917" [disabled] [ref=f1e315]
          - generic [ref=f1e318]:
            - generic [ref=f1e319]:
              - link "Back to AML/CFT assessments" [ref=f1e320] [cursor=pointer]:
                - /url: /supervision/aml/assessments
              - generic [ref=f1e321]:
                - heading "Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)" [level=1] [ref=f1e323]
                - generic [ref=f1e325]:
                  - generic [ref=f1e326]: SUP-AML_CFT-2026-00917
                  - generic [ref=f1e327]: Draft
                  - generic [ref=f1e328]: "Residual: —"
                  - generic [ref=f1e329]: Current
                  - button "Refresh assessment" [ref=f1e330] [cursor=pointer]
            - generic [ref=f1e331]:
              - heading "Assessment header" [level=3] [ref=f1e333]
              - generic [ref=f1e334]:
                - generic [ref=f1e335]:
                  - generic [ref=f1e336]: Methodology
                  - generic [ref=f1e337]:
                    - text: TEST ONLY — AML MATERIALITY CERTIFICATION
                    - generic [ref=f1e338]: v8
                - generic [ref=f1e339]:
                  - generic [ref=f1e340]: Assessment type
                  - generic [ref=f1e341]: Periodic
                - generic [ref=f1e342]:
                  - generic [ref=f1e343]: Trigger
                  - generic [ref=f1e344]: Periodic
                - generic [ref=f1e345]:
                  - generic [ref=f1e346]: Review period
                  - generic [ref=f1e347]: Oct 04, 2025 → Oct 03, 2026
                - generic [ref=f1e348]:
                  - generic [ref=f1e349]: Inherent rating
                  - generic [ref=f1e350]: —
                - generic [ref=f1e353]:
                  - generic [ref=f1e354]: Control effectiveness
                  - generic [ref=f1e355]: —
                - generic [ref=f1e358]:
                  - generic [ref=f1e359]: Next review
                  - generic [ref=f1e360]: —
                - generic [ref=f1e361]:
                  - generic [ref=f1e362]: Confidentiality
                  - generic [ref=f1e363]: Confidential
            - generic [ref=f1e364]:
              - heading "Supervisory actions" [level=3] [ref=f1e366]
              - generic [ref=f1e367]:
                - generic [ref=f1e368]:
                  - generic [ref=f1e369]:
                    - generic [ref=f1e370]: Submission readiness
                    - generic [ref=f1e371]: 0 / 4 dimensions assessed
                  - list [ref=f1e372]:
                    - listitem [ref=f1e373]:
                      - generic [ref=f1e378]:
                        - text: All mandatory inherent risk dimensions completed
                        - generic [ref=f1e379]: "— Outstanding: AML_TECH_CERT_INHERENT, AML_TECH_CERT_INHERENT_B, AML_TECH_CERT_INHERENT_C"
                    - listitem [ref=f1e380]:
                      - generic [ref=f1e385]:
                        - text: All mandatory control effectiveness dimensions completed
                        - generic [ref=f1e386]: "— Outstanding: TEST ONLY control dimension"
                    - listitem [ref=f1e387]:
                      - generic [ref=f1e392]:
                        - text: Required supervisory rationale recorded
                        - generic [ref=f1e393]: "— Missing on: TEST ONLY control dimension, AML_TECH_CERT_INHERENT, AML_TECH_CERT_INHERENT_B, AML_TECH_CERT_INHERENT_C"
                    - listitem [ref=f1e394]:
                      - generic [ref=f1e398]:
                        - text: Required evidence supplied
                        - generic [ref=f1e399]: — Complete
                    - listitem [ref=f1e400]:
                      - generic [ref=f1e405]:
                        - text: Data quality considered
                        - generic [ref=f1e406]: "— Not stated on: TEST ONLY control dimension, AML_TECH_CERT_INHERENT, AML_TECH_CERT_INHERENT_B, AML_TECH_CERT_INHERENT_C"
                    - listitem [ref=f1e407]:
                      - generic [ref=f1e411]:
                        - text: Every departure from the calculated rating is explained
                        - generic [ref=f1e412]: — Complete
                    - listitem [ref=f1e413]:
                      - generic [ref=f1e418]:
                        - text: Mandatory supervisory questions answered
                        - generic [ref=f1e419]: "— 2 outstanding: AML_TECH_CERT_CONTROL AML-TC-CT-01 (no response recorded), AML_TECH_CERT_INHERENT AML-TC-IR-01 (no response recorded)"
                - generic [ref=f1e420]:
                  - button "Submit for supervisory review" [disabled]
                - paragraph [ref=f1e421]: "Actions available to you depend on the lifecycle state and on maker/checker separation: the officer who records the ratings cannot approve them, and the assessment must be approved before it can drive attention, a plan or an examination. Ratings are recorded in the working file against the methodology's own dimensions."
            - generic [ref=f1e422]:
              - tablist [ref=f1e423]:
                - tab "Working file" [selected] [ref=f1e424] [cursor=pointer]
                - tab "Question scope" [ref=f1e425] [cursor=pointer]
                - tab "Policy basis" [ref=f1e426] [cursor=pointer]
                - tab "Inherent risk (3)" [ref=f1e427] [cursor=pointer]
                - tab "Control effectiveness (1)" [ref=f1e428] [cursor=pointer]
                - tab "Calculation" [ref=f1e429] [cursor=pointer]
                - tab "Review & decision" [ref=f1e430] [cursor=pointer]
                - tab "Supervisory consequence" [ref=f1e431] [cursor=pointer]
                - tab "Attention, plan & examination" [ref=f1e432] [cursor=pointer]
                - tab "Findings (0)" [ref=f1e433] [cursor=pointer]
                - tab "Approval history" [ref=f1e434] [cursor=pointer]
              - tabpanel "Working file" [ref=f1e435]:
                - generic [ref=f1e436]:
                  - generic [ref=f1e437]:
                    - generic [ref=f1e439]:
                      - heading "Submission readiness" [level=3] [ref=f1e440]
                      - generic [ref=f1e441]:
                        - generic [ref=f1e442]: 3 outstanding
                        - generic [ref=f1e443]: Governed question plan
                    - generic [ref=f1e444]:
                      - list [ref=f1e445]:
                        - listitem [ref=f1e446]:
                          - generic [ref=f1e450]:
                            - paragraph [ref=f1e451]: Methodology version attached
                            - paragraph [ref=f1e452]: Bound to the exact methodology version used at creation.
                        - listitem [ref=f1e453]:
                          - generic [ref=f1e457]:
                            - paragraph [ref=f1e458]: Governed question plan
                            - paragraph [ref=f1e459]: 4 question(s) resolved in the governed plan.
                        - listitem [ref=f1e460]:
                          - generic [ref=f1e465]:
                            - paragraph [ref=f1e466]:
                              - text: Questions answered
                              - generic [ref=f1e467]: 2 outstanding
                            - paragraph [ref=f1e468]: Every mandatory question in scope must carry a supervisory answer.
                            - list [ref=f1e469]:
                              - listitem [ref=f1e470]: AML_TECH_CERT_CONTROL AML-TC-CT-01 — unanswered
                              - listitem [ref=f1e471]: AML_TECH_CERT_INHERENT AML-TC-IR-01 — unanswered
                        - listitem [ref=f1e472]:
                          - generic [ref=f1e476]:
                            - paragraph [ref=f1e477]: Observations and not-applicable reasons
                            - paragraph [ref=f1e478]: A written observation or not-applicable reason is required where the methodology says so.
                        - listitem [ref=f1e479]:
                          - generic [ref=f1e483]:
                            - paragraph [ref=f1e484]: Governed evidence basis
                            - paragraph [ref=f1e485]: Questions the methodology marks as evidence-based must cite governed evidence.
                        - listitem [ref=f1e486]:
                          - generic [ref=f1e490]:
                            - paragraph [ref=f1e491]: Evidence policy of the governing profile
                            - paragraph [ref=f1e492]: The policy profile governing this assessment binds no evidence policy, so only the methodology's own evidence requirements apply.
                        - listitem [ref=f1e493]:
                          - generic [ref=f1e498]:
                            - paragraph [ref=f1e499]:
                              - text: Required structured facts
                              - generic [ref=f1e500]: 1 outstanding
                            - paragraph [ref=f1e501]: Facts the methodology requires for questions in scope must be recorded with provenance.
                            - list [ref=f1e502]:
                              - listitem [ref=f1e503]: AML_TECH_CERT_STR_COUNT — fact missing
                        - listitem [ref=f1e504]:
                          - generic [ref=f1e507]:
                            - paragraph [ref=f1e508]: Dimension ratings recorded
                            - paragraph [ref=f1e509]: 0 of 4 applicable dimension(s) rated.
                        - listitem [ref=f1e510]:
                          - generic [ref=f1e514]:
                            - paragraph [ref=f1e515]: Fact provenance and officer changes
                            - paragraph [ref=f1e516]: 0 recorded fact(s) without a source reference; 0 officer change(s) on prefilled values.
                        - listitem [ref=f1e517]:
                          - generic [ref=f1e522]:
                            - paragraph [ref=f1e523]:
                              - text: Risk factor applicability and materiality
                              - generic [ref=f1e524]: 2 outstanding
                            - paragraph [ref=f1e525]: 2 risk factor(s) cannot be decided until the listed facts are recorded.
                            - list [ref=f1e526]:
                              - listitem [ref=f1e527]: "AML_TECH_CERT_INHERENT — Not calculated until these facts are recorded: AML TECH CERT STR COUNT."
                              - listitem [ref=f1e528]: "AML_TECH_CERT_INHERENT_B — Not calculated until these facts are recorded: AML TECH CERT STR COUNT."
                      - paragraph [ref=f1e529]: This is the platform's own check. Submission is refused for exactly the items marked as outstanding here.
                  - generic [ref=f1e530]:
                    - generic [ref=f1e531]:
                      - heading "Governing configuration" [level=3] [ref=f1e532]
                      - paragraph [ref=f1e533]: Fixed when the assessment was created from policy package AML_TECH_CERT_POLICY 6. Later configuration changes do not alter it.
                    - generic [ref=f1e534]:
                      - generic [ref=f1e535]:
                        - generic [ref=f1e536]:
                          - generic [ref=f1e537]:
                            - generic [ref=f1e538]: Sector overlay
                            - generic [ref=f1e539]: AML_TECH_CERT_OVERLAY v4
                          - paragraph [ref=f1e540]: "Entity sector: VIRTUAL_ASSET_BUSINESS — applicable"
                        - generic [ref=f1e542]:
                          - generic [ref=f1e543]: Fact configuration
                          - generic [ref=f1e544]: AML_TECH_CERT_FACTS v2
                        - generic [ref=f1e546]:
                          - generic [ref=f1e547]: Source binding
                          - generic [ref=f1e548]: AML_TECH_CERT_SOURCES v1
                      - table [ref=f1e550]:
                        - rowgroup [ref=f1e551]:
                          - row [ref=f1e552]:
                            - columnheader "Fact" [ref=f1e553]
                            - columnheader "May be recorded" [ref=f1e554]
                            - columnheader "Mandatory" [ref=f1e555]
                            - columnheader "Accepted sources" [ref=f1e556]
                            - columnheader "Status" [ref=f1e557]
                        - rowgroup [ref=f1e558]:
                          - row [ref=f1e559]:
                            - cell "AML_TECH_CERT_CHECK_DATE TEST ONLY synthetic date (technical certification)" [ref=f1e560]
                            - cell "Yes" [ref=f1e561]
                            - cell "No" [ref=f1e562]
                            - cell "MANUAL · AML_TECH_CERT officer entry (TEST ONLY)" [ref=f1e563]
                            - cell "Not recorded" [ref=f1e564]
                          - row [ref=f1e566]:
                            - cell "AML_TECH_CERT_HAS_FLAG TEST ONLY synthetic yes/no (technical certification)" [ref=f1e567]
                            - cell "Yes" [ref=f1e568]
                            - cell "Yes" [ref=f1e569]
                            - cell "MANUAL · AML_TECH_CERT officer entry (TEST ONLY)" [ref=f1e570]
                            - cell "Missing" [ref=f1e571]
                          - row [ref=f1e573]:
                            - cell "AML_TECH_CERT_NOT_CONFIGURED TEST ONLY synthetic fact outside fact settings" [ref=f1e574]
                            - cell "No — not in the fact settings" [ref=f1e575]
                            - cell "No" [ref=f1e576]
                            - cell "Any stated source" [ref=f1e577]
                            - cell "Not recorded" [ref=f1e578]
                          - row [ref=f1e580]:
                            - cell "AML_TECH_CERT_OTHER_SECTOR TEST ONLY synthetic other-sector fact" [ref=f1e581]
                            - cell "No — applies to another sector (INTERNATIONAL_BANKING)" [ref=f1e582]
                            - cell "No" [ref=f1e583]
                            - cell "Any stated source" [ref=f1e584]
                            - cell "Not recorded" [ref=f1e585]
                          - row [ref=f1e587]:
                            - cell "AML_TECH_CERT_STR_COUNT TEST ONLY synthetic count (technical certification)" [ref=f1e588]
                            - cell "Yes (VIRTUAL_ASSET_BUSINESS)" [ref=f1e589]
                            - cell "Yes" [ref=f1e590]
                            - cell "RETURN · AML_TECH_CERT synthetic return (TEST ONLY)" [ref=f1e591]
                            - cell "Missing" [ref=f1e592]
                          - row [ref=f1e594]:
                            - cell "AML_TECH_CERT_TIER TEST ONLY synthetic category (technical certification)" [ref=f1e595]
                            - cell "Yes" [ref=f1e596]
                            - cell "No" [ref=f1e597]
                            - cell "FORM · AML_TECH_CERT synthetic form (TEST ONLY)" [ref=f1e598]
                            - cell "Not recorded" [ref=f1e599]
                          - row [ref=f1e601]:
                            - cell "AML_TECH_CERT_TYPE_CONFLICT TEST ONLY synthetic type-conflict fact" [ref=f1e602]
                            - cell "No — not in the fact settings" [ref=f1e603]
                            - cell "No" [ref=f1e604]
                            - cell "Any stated source" [ref=f1e605]
                            - cell "Not recorded" [ref=f1e606]
                  - generic [ref=f1e608]:
                    - generic [ref=f1e610]:
                      - heading "Evidence policy" [level=3] [ref=f1e611]
                      - generic [ref=f1e612]: NOT GOVERNED BY AN EVIDENCE POLICY
                    - paragraph [ref=f1e614]: The policy profile governing this assessment binds no evidence policy, so only the methodology's own evidence requirements apply.
                  - generic [ref=f1e617]:
                    - generic [ref=f1e619]:
                      - heading "Structured facts" [level=3] [ref=f1e620]
                      - generic [ref=f1e621]: 1 of 7 recorded
                    - generic [ref=f1e622]:
                      - list [ref=f1e623]:
                        - listitem [ref=f1e624]:
                          - generic [ref=f1e625]:
                            - paragraph [ref=f1e626]: TEST ONLY synthetic date (technical certification)
                            - generic [ref=f1e627]:
                              - generic [ref=f1e628]: AML_TECH_CERT_CHECK_DATE
                              - generic [ref=f1e629]: date
                            - paragraph [ref=f1e630]: Synthetic technical-certification fact. Not an FSRA requirement.
                          - button "Record" [ref=f1e631] [cursor=pointer]
                        - listitem [ref=f1e632]:
                          - generic [ref=f1e633]:
                            - paragraph [ref=f1e634]: TEST ONLY synthetic yes/no (technical certification)
                            - generic [ref=f1e635]:
                              - generic [ref=f1e636]: AML_TECH_CERT_HAS_FLAG
                              - generic [ref=f1e637]: boolean
                              - generic [ref=f1e638]: Required
                              - generic [ref=f1e639]: "true"
                            - paragraph [ref=f1e640]: "Source: MANUAL · TEST-AML-CLOSE-03A-AML_TECH_CERT_HAS_FLAG"
                          - button "Update" [ref=f1e641] [cursor=pointer]
                        - listitem [ref=f1e642]:
                          - generic [ref=f1e643]:
                            - paragraph [ref=f1e644]: TEST ONLY synthetic fact outside fact settings
                            - generic [ref=f1e645]:
                              - generic [ref=f1e646]: AML_TECH_CERT_NOT_CONFIGURED
                              - generic [ref=f1e647]: text
                              - generic [ref=f1e648]: Not used by the governing fact settings
                            - paragraph [ref=f1e649]: Synthetic. Deliberately absent from the TEST fact settings.
                        - listitem [ref=f1e650]:
                          - generic [ref=f1e651]:
                            - paragraph [ref=f1e652]: TEST ONLY synthetic other-sector fact
                            - generic [ref=f1e653]:
                              - generic [ref=f1e654]: AML_TECH_CERT_OTHER_SECTOR
                              - generic [ref=f1e655]: integer
                              - generic [ref=f1e656]: Not used by the governing fact settings
                            - paragraph [ref=f1e657]: Synthetic. Applies only to a different sector in the TEST fact settings.
                        - listitem [ref=f1e658]:
                          - generic [ref=f1e659]:
                            - paragraph [ref=f1e660]: TEST ONLY synthetic count (technical certification)
                            - generic [ref=f1e661]:
                              - generic [ref=f1e662]: AML_TECH_CERT_STR_COUNT
                              - generic [ref=f1e663]: integer
                              - generic [ref=f1e664]: Required
                            - paragraph [ref=f1e665]: Synthetic technical-certification fact. Not an FSRA requirement.
                          - button "Record" [ref=f1e666] [cursor=pointer]
                        - listitem [ref=f1e667]:
                          - generic [ref=f1e668]:
                            - paragraph [ref=f1e669]: TEST ONLY synthetic category (technical certification)
                            - generic [ref=f1e670]:
                              - generic [ref=f1e671]: AML_TECH_CERT_TIER
                              - generic [ref=f1e672]: category
                            - paragraph [ref=f1e673]: Synthetic technical-certification fact. Not an FSRA requirement.
                          - button "Record" [ref=f1e674] [cursor=pointer]
                        - listitem [ref=f1e675]:
                          - generic [ref=f1e676]:
                            - paragraph [ref=f1e677]: TEST ONLY synthetic type-conflict fact
                            - generic [ref=f1e678]:
                              - generic [ref=f1e679]: AML_TECH_CERT_TYPE_CONFLICT
                              - generic [ref=f1e680]: integer
                              - generic [ref=f1e681]: Not used by the governing fact settings
                            - paragraph [ref=f1e682]: Synthetic. TEST fact settings declare a conflicting type.
                      - paragraph [ref=f1e683]: Facts support supervisory judgement. They are never treated as an answer, a rating or a conclusion.
                  - generic [ref=f1e684]:
                    - heading "Risk-factor applicability and materiality" [level=3] [ref=f1e686]
                    - generic [ref=f1e687]:
                      - paragraph [ref=f1e688]: Decided by the platform from calculation settings v1 pinned to this assessment (AML_TECH_CERT_METHOD v8). Later versions do not change it.
                      - generic [ref=f1e689]:
                        - generic [ref=f1e690]: "Status:"
                        - generic [ref=f1e691]: Governed
                        - generic [ref=f1e692]: 2 factor(s) waiting for information
                      - table [ref=f1e695]:
                        - rowgroup [ref=f1e696]:
                          - row [ref=f1e697]:
                            - columnheader "Factor" [ref=f1e698]
                            - columnheader "Applicability" [ref=f1e699]
                            - columnheader "Materiality" [ref=f1e700]
                            - columnheader "Effect on rating" [ref=f1e701]
                            - columnheader "Reason" [ref=f1e702]
                        - rowgroup [ref=f1e703]:
                          - row [ref=f1e704]:
                            - cell "AML_TECH_CERT_CONTROL" [ref=f1e705]
                            - cell "Applicable" [ref=f1e706]
                            - cell "No materiality rule" [ref=f1e708]
                            - cell "Included in rating" [ref=f1e710]
                            - cell "The calculation settings apply this factor to every assessment. · No materiality rule is published for this factor, so it contributes as calculated." [ref=f1e712]
                          - row [ref=f1e713]:
                            - cell "AML_TECH_CERT_INHERENT" [ref=f1e714]
                            - cell "Applicable" [ref=f1e715]
                            - cell "Information pending" [ref=f1e717]
                            - cell "Information pending" [ref=f1e719]
                            - 'cell "Fact AML_TECH_CERT_HAS_FLAG meets the applicability condition IS_TRUE. · Fact AML_TECH_CERT_STR_COUNT has not been recorded, so materiality cannot be decided. Missing: AML_TECH_CERT_STR_COUNT" [ref=f1e721]':
                              - text: Fact AML_TECH_CERT_HAS_FLAG meets the applicability condition IS_TRUE. · Fact AML_TECH_CERT_STR_COUNT has not been recorded, so materiality cannot be decided.
                              - generic [ref=f1e722]: "Missing: AML_TECH_CERT_STR_COUNT"
                          - row [ref=f1e723]:
                            - cell "AML_TECH_CERT_INHERENT_B" [ref=f1e724]
                            - cell "Applicable" [ref=f1e725]
                            - cell "Information pending" [ref=f1e727]
                            - cell "Information pending" [ref=f1e729]
                            - 'cell "The calculation settings apply this factor to every assessment. · Fact AML_TECH_CERT_STR_COUNT has not been recorded, so materiality cannot be decided. Missing: AML_TECH_CERT_STR_COUNT" [ref=f1e731]':
                              - text: The calculation settings apply this factor to every assessment. · Fact AML_TECH_CERT_STR_COUNT has not been recorded, so materiality cannot be decided.
                              - generic [ref=f1e732]: "Missing: AML_TECH_CERT_STR_COUNT"
                          - row [ref=f1e733]:
                            - cell "AML_TECH_CERT_INHERENT_C" [ref=f1e734]
                            - cell "Not applicable" [ref=f1e735]
                            - cell "Not evaluated" [ref=f1e737]
                            - cell "Not applicable" [ref=f1e739]
                            - cell "Sector VIRTUAL_ASSET_BUSINESS is not one of the sectors this factor applies to (INTERNATIONAL_BANKING). · Materiality is only decided for a factor that applies." [ref=f1e741]
                  - generic [ref=f1e742]:
                    - generic [ref=f1e743]:
                      - heading "Working file completion" [level=3] [ref=f1e745]
                      - generic [ref=f1e746]:
                        - generic [ref=f1e747]:
                          - progressbar [ref=f1e748]
                          - generic [ref=f1e750]: 0 / 4 dimensions assessed
                        - generic [ref=f1e751]:
                          - progressbar [ref=f1e752]
                          - generic [ref=f1e754]: 0 / 2 mandatory questions answered
                        - paragraph [ref=f1e755]: Every dimension and question below is configured on the methodology version attached to this assessment. Dimension codes cannot be invented — you record judgment against the configured methodology, and the database refuses submission while any mandatory question remains outstanding.
                    - generic [ref=f1e756]:
                      - heading "Control effectiveness0 / 1 assessed" [level=3] [ref=f1e758]:
                        - text: Control effectiveness
                        - generic [ref=f1e759]: 0 / 1 assessed
                      - heading [level=3] [ref=f1e763]:
                        - button "TEST ONLY control dimension weight 100 —" [ref=f1e764] [cursor=pointer]:
                          - generic [ref=f1e765]:
                            - generic [ref=f1e768]: TEST ONLY control dimension
                            - generic [ref=f1e769]: weight 100
                            - generic [ref=f1e770]: —
                    - generic [ref=f1e773]:
                      - heading "Inherent risk0 / 3 assessed" [level=3] [ref=f1e775]:
                        - text: Inherent risk
                        - generic [ref=f1e776]: 0 / 3 assessed
                      - generic [ref=f1e778]:
                        - heading [level=3] [ref=f1e780]:
                          - button "AML_TECH_CERT_INHERENT weight 40 —" [ref=f1e781] [cursor=pointer]:
                            - generic [ref=f1e782]:
                              - generic [ref=f1e785]: AML_TECH_CERT_INHERENT
                              - generic [ref=f1e786]: weight 40
                              - generic [ref=f1e787]: —
                        - heading [level=3] [ref=f1e791]:
                          - button "AML_TECH_CERT_INHERENT_B weight 30 —" [ref=f1e792] [cursor=pointer]:
                            - generic [ref=f1e793]:
                              - generic [ref=f1e796]: AML_TECH_CERT_INHERENT_B
                              - generic [ref=f1e797]: weight 30
                              - generic [ref=f1e798]: —
                        - heading [level=3] [ref=f1e802]:
                          - button "AML_TECH_CERT_INHERENT_C weight 30 —" [ref=f1e803] [cursor=pointer]:
                            - generic [ref=f1e804]:
                              - generic [ref=f1e807]: AML_TECH_CERT_INHERENT_C
                              - generic [ref=f1e808]: weight 30
                              - generic [ref=f1e809]: —
            - alert [ref=f1e812]:
              - heading "Not yet approved" [level=5] [ref=f1e815]
              - generic [ref=f1e816]: Ratings shown are provisional until the assessment is approved by a checker other than its maker.
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { loginAs } from './support/auth';
  3   | import { persona } from './support/personas';
  4   | import { rpc } from './support/api';
  5   | 
  6   | /**
  7   |  * AML-CLOSE-03A — complete browser journey for risk-factor applicability and
  8   |  * materiality, plus the missing-information fail-closed proof.
  9   |  *
  10  |  * Writes ONLY to a new, disposable assessment on the TEST-perimeter Virtual
  11  |  * Asset demo licensee, created through the New assessment dialog. Requires the
  12  |  * TEST-only package AML_TECH_CERT_POLICY to be ACTIVE for that sector; when it
  13  |  * is not (it is retired between certification runs), the journey is skipped
  14  |  * with an explicit reason rather than reported as passed.
  15  |  *
  16  |  * All values are TEST-only technical certification values, never FSRA policy.
  17  |  */
  18  | const OFFICER = persona('aml_supervision_officer');
  19  | const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
  20  | const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
  21  | const PROTECTED = ['66cc17e3-f944-4b93-be22-8857565a1213'];
  22  | 
  23  | type Factor = { dimension_code: string; outcome: string; applicability_status: string; materiality_status: string };
  24  | 
  25  | async function factorRows(page: Page): Promise<Record<string, string>> {
  26  |   const panel = page.getByTestId('aml-factor-authority');
  27  |   await expect(panel.locator('tr[data-factor]').first()).toBeVisible({ timeout: 45_000 });
  28  |   const rows = await panel.locator('tr[data-factor]').all();
  29  |   const out: Record<string, string> = {};
  30  |   for (const r of rows) out[(await r.getAttribute('data-factor'))!] = (await r.getAttribute('data-outcome'))!;
  31  |   return out;
  32  | }
  33  | 
  34  | async function recordFact(page: Page, code: string, value: string) {
  35  |   const card = page.locator('li', { hasText: code }).filter({ has: page.getByRole('button', { name: /^Record$/ }) }).last();
  36  |   await card.getByRole('button', { name: /^Record$/ }).click();
  37  |   const d = page.getByRole('dialog');
  38  |   const inputs = d.locator('input:not([type=date])');
  39  |   await inputs.nth(0).fill(value);
  40  |   await inputs.nth(1).fill(`TEST-AML-CLOSE-03A-${code}`);
  41  |   await d.getByRole('button', { name: 'Record fact' }).click();
  42  |   await expect(d).toBeHidden({ timeout: 20_000 });
  43  | }
  44  | 
  45  | test.describe.serial('AML-CLOSE-03A browser journey (TEST package)', () => {
  46  |   let assessmentId = '';
  47  | 
  48  |   test.beforeAll(async () => {
  49  |     const elig = await rpc(OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT' });
  50  |     test.skip(!(elig.body as { allowed?: boolean })?.allowed, `TEST perimeter not available: ${elig.bodyText}`);
  51  |   });
  52  | 
  53  |   test('create assessment through the dialog; policy, methodology and settings resolve', async ({ page }) => {
  54  |     expect(await loginAs(page, OFFICER)).not.toBe('/login');
  55  |     await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
  56  |     await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
  57  |     await page.locator('#aml-entity-pick').click();
  58  |     await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click();
  59  |     await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
  60  |     const opt = page.getByRole('option').filter({ hasText: /periodic/i }).first();
  61  |     test.skip(!(await opt.isVisible().catch(() => false)), 'No selectable periodic programme (TEST package retired)');
  62  |     await opt.click();
  63  |     await expect(page.getByText(/AML_TECH_CERT_METHOD v\d+/)).toBeVisible({ timeout: 30_000 });
  64  |     await page.getByRole('button', { name: 'Continue' }).click();
  65  |     const d = page.getByRole('dialog');
  66  |     for (const ta of await d.locator('textarea').all()) await ta.fill('TEST ONLY — AML-CLOSE-03A browser certification; not FSRA policy.');
  67  |     await d.getByRole('button', { name: 'Create assessment' }).click();
  68  |     await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
  69  |     assessmentId = page.url().split('/').pop()!.split('?')[0];
  70  |     expect(PROTECTED).not.toContain(assessmentId);
  71  |   });
  72  | 
  73  |   test('missing facts fail closed; recording them refreshes the factor decision automatically', async ({ page }) => {
  74  |     test.skip(!assessmentId, 'assessment not created');
  75  |     await loginAs(page, OFFICER);
  76  |     await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });
  77  | 
  78  |     const before = await factorRows(page);
  79  |     expect(before.AML_TECH_CERT_INHERENT).toBe('PENDING_INFORMATION');
  80  |     expect(before.AML_TECH_CERT_INHERENT_B).toBe('PENDING_INFORMATION');
  81  |     expect(before.AML_TECH_CERT_INHERENT_C).toBe('NOT_APPLICABLE');
  82  |     await expect(page.getByTestId('aml-factor-authority')).toContainText('Missing: AML_TECH_CERT_HAS_FLAG');
  83  | 
  84  |     // Fail-closed at the server: submission is refused while information is pending.
  85  |     const sub = await rpc(OFFICER, 'supervisory_assessment_submit_for_review', { _assessment_id: assessmentId });
  86  |     expect(sub.ok, 'submission must be refused while factor information is pending').toBeFalsy();
  87  | 
  88  |     await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
> 89  |     await expect.poll(async () => (await factorRows(page)).AML_TECH_CERT_INHERENT, { timeout: 30_000 }).not.toBe('PENDING_INFORMATION');
      |                                                                                                             ^ Error: expect(received).not.toBe(expected) // Object.is equality
  90  |     await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '12');
  91  |     await expect.poll(async () => (await factorRows(page)).AML_TECH_CERT_INHERENT_B, { timeout: 30_000 }).toBe('EXCLUDED_NOT_MATERIAL');
  92  | 
  93  |     const after = await factorRows(page);
  94  |     expect(after).toMatchObject({
  95  |       AML_TECH_CERT_INHERENT: 'INCLUDED',
  96  |       AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL',
  97  |       AML_TECH_CERT_INHERENT_C: 'NOT_APPLICABLE',
  98  |       AML_TECH_CERT_CONTROL: 'INCLUDED',
  99  |     });
  100 |     await expect(page.getByTestId('aml-factor-authority')).not.toContainText('waiting for information');
  101 |   });
  102 | 
  103 |   test('answer questions, calculate, reload: same result', async ({ page }) => {
  104 |     test.skip(!assessmentId, 'assessment not created');
  105 |     await loginAs(page, OFFICER);
  106 |     await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });
  107 |     await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
  108 | 
  109 |     // Open every dimension in the working file and answer each question.
  110 |     for (const t of await page.locator('[data-radix-collection-item][data-state="closed"]').filter({ hasText: /AML_TECH_CERT|TEST/ }).all()) {
  111 |       await t.click().catch(() => {});
  112 |     }
  113 |     const answers: Record<string, RegExp> = { 'AML-TC-IR-01': /Partially/i };
  114 |     const triggers = page.locator('button[id^="resp-"]');
  115 |     const n = await triggers.count();
  116 |     expect(n, 'questions visible in the working file').toBeGreaterThan(0);
  117 |     for (let i = 0; i < n; i++) {
  118 |       const trig = triggers.nth(i);
  119 |       const card = trig.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  120 |       const text = await card.innerText();
  121 |       const code = Object.keys(answers).find((k) => text.includes(k));
  122 |       await trig.click();
  123 |       await page.getByRole('option', { name: code ? answers[code] : /^Yes$/i }).first().click();
  124 |       const obs = card.locator('textarea');
  125 |       if (await obs.count()) await obs.first().fill('TEST ONLY observation — AML-CLOSE-03A');
  126 |       await card.getByRole('button', { name: 'Save response' }).click();
  127 |       await expect(card.getByRole('button', { name: 'Save response' })).toBeEnabled({ timeout: 20_000 });
  128 |     }
  129 | 
  130 |     await page.getByRole('tab', { name: 'Calculation' }).click();
  131 |     await page.getByRole('button', { name: 'Recalculate' }).click();
  132 |     const result = page.locator('[role="tabpanel"]', { hasText: 'Calculation / risk result' });
  133 |     await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
  134 |     const first = await result.innerText();
  135 | 
  136 |     await page.reload({ waitUntil: 'domcontentloaded' });
  137 |     await page.getByRole('tab', { name: 'Calculation' }).click();
  138 |     await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
  139 |     expect(await factorRows(page)).toMatchObject({ AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL' });
  140 | 
  141 |     const fa = await rpc(OFFICER, 'supervisory_assessment_factor_authority', { _assessment_id: assessmentId });
  142 |     const body = fa.body as { latest_run: { status: string; engine_version: string; matches_current_evaluation: boolean }; evaluation: { factors: Factor[] } };
  143 |     expect(body.latest_run.status).toBe('CALCULATED');
  144 |     expect(body.latest_run.engine_version).toBe('AML06.2');
  145 |     expect(body.latest_run.matches_current_evaluation).toBe(true);
  146 |     expect(first.length).toBeGreaterThan(0);
  147 |   });
  148 | });
  149 | 
  150 | test.describe('AML-CLOSE-03A security proofs for new routines', () => {
  151 |   const A = '8f6e487f-68c1-4038-b3e2-693a2d91a360';
  152 |   const URL_BASE = process.env.VITE_SUPABASE_URL as string;
  153 |   const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  154 |   const anon = (fn: string, body: unknown) => fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
  155 |     method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  156 |   });
  157 | 
  158 |   test('factor authority: out-of-scope personas and anonymous are refused', async () => {
  159 |     for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
  160 |       const r = await rpc(persona(p), 'supervisory_assessment_factor_authority', { _assessment_id: A });
  161 |       expect(r.ok, `${p} must be refused`).toBeFalsy();
  162 |     }
  163 |     expect((await anon('supervisory_assessment_factor_authority', { _assessment_id: A })).status).toBe(401);
  164 |   });
  165 | 
  166 |   test('applicability set: only configuration managers, only on drafts; anonymous refused', async () => {
  167 |     const C1 = '18ca681c-cc57-44b3-9d85-276b0b930d8c';
  168 |     for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
  169 |       const r = await rpc(persona(p), 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
  170 |       expect(r.ok, `${p} must be refused`).toBeFalsy();
  171 |     }
  172 |     const r = await rpc(OFFICER, 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
  173 |     expect(r.ok).toBeFalsy();
  174 |     expect(r.bodyText).toMatch(/only be edited while the configuration is a draft/);
  175 |     expect((await anon('supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] })).status).toBe(401);
  176 |   });
  177 | 
  178 |   test('internal readiness routine is not callable directly', async () => {
  179 |     const r = await rpc(persona('complaints_officer'), 'supervisory_assessment_readiness_internal', { _assessment_id: A });
  180 |     expect(r.ok).toBeFalsy();
  181 |     expect(r.bodyText).toMatch(/permission denied/);
  182 |   });
  183 | });
  184 | 
```