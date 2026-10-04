# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-aml-materiality-browser-journey.spec.ts >> AML-CLOSE-03A browser journey (TEST package) >> answer questions, calculate, reload: same result
- Location: e2e/cert-v2/09-aml-materiality-browser-journey.spec.ts:105:3

# Error details

```
Error: questions visible in the working file

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
          - button "Notifications, 256 unread" [ref=f1e287] [cursor=pointer]:
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
                - link "SUP-AML_CFT-2026-00918" [disabled] [ref=f1e315]
          - generic [ref=f1e318]:
            - generic [ref=f1e319]:
              - link "Back to AML/CFT assessments" [ref=f1e320] [cursor=pointer]:
                - /url: /supervision/aml/assessments
              - generic [ref=f1e321]:
                - heading "Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)" [level=1] [ref=f1e323]
                - generic [ref=f1e325]:
                  - generic [ref=f1e326]: SUP-AML_CFT-2026-00918
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
                        - generic [ref=f1e442]: 1 outstanding
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
                          - generic [ref=f1e497]:
                            - paragraph [ref=f1e498]: Required structured facts
                            - paragraph [ref=f1e499]: Facts the methodology requires for questions in scope must be recorded with provenance.
                        - listitem [ref=f1e500]:
                          - generic [ref=f1e503]:
                            - paragraph [ref=f1e504]: Dimension ratings recorded
                            - paragraph [ref=f1e505]: 0 of 4 applicable dimension(s) rated.
                        - listitem [ref=f1e506]:
                          - generic [ref=f1e510]:
                            - paragraph [ref=f1e511]: Fact provenance and officer changes
                            - paragraph [ref=f1e512]: 0 recorded fact(s) without a source reference; 0 officer change(s) on prefilled values.
                        - listitem [ref=f1e513]:
                          - generic [ref=f1e517]:
                            - paragraph [ref=f1e518]: Risk factor applicability and materiality
                            - paragraph [ref=f1e519]: 0 risk factor(s) cannot be decided until the listed facts are recorded.
                      - paragraph [ref=f1e520]: This is the platform's own check. Submission is refused for exactly the items marked as outstanding here.
                  - generic [ref=f1e521]:
                    - generic [ref=f1e522]:
                      - heading "Governing configuration" [level=3] [ref=f1e523]
                      - paragraph [ref=f1e524]: Fixed when the assessment was created from policy package AML_TECH_CERT_POLICY 6. Later configuration changes do not alter it.
                    - generic [ref=f1e525]:
                      - generic [ref=f1e526]:
                        - generic [ref=f1e527]:
                          - generic [ref=f1e528]:
                            - generic [ref=f1e529]: Sector overlay
                            - generic [ref=f1e530]: AML_TECH_CERT_OVERLAY v4
                          - paragraph [ref=f1e531]: "Entity sector: VIRTUAL_ASSET_BUSINESS — applicable"
                        - generic [ref=f1e533]:
                          - generic [ref=f1e534]: Fact configuration
                          - generic [ref=f1e535]: AML_TECH_CERT_FACTS v2
                        - generic [ref=f1e537]:
                          - generic [ref=f1e538]: Source binding
                          - generic [ref=f1e539]: AML_TECH_CERT_SOURCES v1
                      - table [ref=f1e541]:
                        - rowgroup [ref=f1e542]:
                          - row [ref=f1e543]:
                            - columnheader "Fact" [ref=f1e544]
                            - columnheader "May be recorded" [ref=f1e545]
                            - columnheader "Mandatory" [ref=f1e546]
                            - columnheader "Accepted sources" [ref=f1e547]
                            - columnheader "Status" [ref=f1e548]
                        - rowgroup [ref=f1e549]:
                          - row [ref=f1e550]:
                            - cell "AML_TECH_CERT_CHECK_DATE TEST ONLY synthetic date (technical certification)" [ref=f1e551]
                            - cell "Yes" [ref=f1e552]
                            - cell "No" [ref=f1e553]
                            - cell "MANUAL · AML_TECH_CERT officer entry (TEST ONLY)" [ref=f1e554]
                            - cell "Not recorded" [ref=f1e555]
                          - row [ref=f1e557]:
                            - cell "AML_TECH_CERT_HAS_FLAG TEST ONLY synthetic yes/no (technical certification)" [ref=f1e558]
                            - cell "Yes" [ref=f1e559]
                            - cell "Yes" [ref=f1e560]
                            - cell "MANUAL · AML_TECH_CERT officer entry (TEST ONLY)" [ref=f1e561]
                            - cell "Recorded (MANUAL)" [ref=f1e562]
                          - row [ref=f1e564]:
                            - cell "AML_TECH_CERT_NOT_CONFIGURED TEST ONLY synthetic fact outside fact settings" [ref=f1e565]
                            - cell "No — not in the fact settings" [ref=f1e566]
                            - cell "No" [ref=f1e567]
                            - cell "Any stated source" [ref=f1e568]
                            - cell "Not recorded" [ref=f1e569]
                          - row [ref=f1e571]:
                            - cell "AML_TECH_CERT_OTHER_SECTOR TEST ONLY synthetic other-sector fact" [ref=f1e572]
                            - cell "No — applies to another sector (INTERNATIONAL_BANKING)" [ref=f1e573]
                            - cell "No" [ref=f1e574]
                            - cell "Any stated source" [ref=f1e575]
                            - cell "Not recorded" [ref=f1e576]
                          - row [ref=f1e578]:
                            - cell "AML_TECH_CERT_STR_COUNT TEST ONLY synthetic count (technical certification)" [ref=f1e579]
                            - cell "Yes (VIRTUAL_ASSET_BUSINESS)" [ref=f1e580]
                            - cell "Yes" [ref=f1e581]
                            - cell "RETURN · AML_TECH_CERT synthetic return (TEST ONLY)" [ref=f1e582]
                            - cell "Recorded (RETURN)" [ref=f1e583]
                          - row [ref=f1e585]:
                            - cell "AML_TECH_CERT_TIER TEST ONLY synthetic category (technical certification)" [ref=f1e586]
                            - cell "Yes" [ref=f1e587]
                            - cell "No" [ref=f1e588]
                            - cell "FORM · AML_TECH_CERT synthetic form (TEST ONLY)" [ref=f1e589]
                            - cell "Not recorded" [ref=f1e590]
                          - row [ref=f1e592]:
                            - cell "AML_TECH_CERT_TYPE_CONFLICT TEST ONLY synthetic type-conflict fact" [ref=f1e593]
                            - cell "No — not in the fact settings" [ref=f1e594]
                            - cell "No" [ref=f1e595]
                            - cell "Any stated source" [ref=f1e596]
                            - cell "Not recorded" [ref=f1e597]
                  - generic [ref=f1e599]:
                    - generic [ref=f1e601]:
                      - heading "Evidence policy" [level=3] [ref=f1e602]
                      - generic [ref=f1e603]: NOT GOVERNED BY AN EVIDENCE POLICY
                    - paragraph [ref=f1e605]: The policy profile governing this assessment binds no evidence policy, so only the methodology's own evidence requirements apply.
                  - generic [ref=f1e608]:
                    - generic [ref=f1e610]:
                      - heading "Structured facts" [level=3] [ref=f1e611]
                      - generic [ref=f1e612]: 2 of 7 recorded
                    - generic [ref=f1e613]:
                      - list [ref=f1e614]:
                        - listitem [ref=f1e615]:
                          - generic [ref=f1e616]:
                            - paragraph [ref=f1e617]: TEST ONLY synthetic date (technical certification)
                            - generic [ref=f1e618]:
                              - generic [ref=f1e619]: AML_TECH_CERT_CHECK_DATE
                              - generic [ref=f1e620]: date
                            - paragraph [ref=f1e621]: Synthetic technical-certification fact. Not an FSRA requirement.
                          - button "Record" [ref=f1e622] [cursor=pointer]
                        - listitem [ref=f1e623]:
                          - generic [ref=f1e624]:
                            - paragraph [ref=f1e625]: TEST ONLY synthetic yes/no (technical certification)
                            - generic [ref=f1e626]:
                              - generic [ref=f1e627]: AML_TECH_CERT_HAS_FLAG
                              - generic [ref=f1e628]: boolean
                              - generic [ref=f1e629]: Required
                              - generic [ref=f1e630]: "true"
                            - paragraph [ref=f1e631]: "Source: MANUAL · TEST-AML-CLOSE-03A-AML_TECH_CERT_HAS_FLAG"
                          - button "Update" [ref=f1e632] [cursor=pointer]
                        - listitem [ref=f1e633]:
                          - generic [ref=f1e634]:
                            - paragraph [ref=f1e635]: TEST ONLY synthetic fact outside fact settings
                            - generic [ref=f1e636]:
                              - generic [ref=f1e637]: AML_TECH_CERT_NOT_CONFIGURED
                              - generic [ref=f1e638]: text
                              - generic [ref=f1e639]: Not used by the governing fact settings
                            - paragraph [ref=f1e640]: Synthetic. Deliberately absent from the TEST fact settings.
                        - listitem [ref=f1e641]:
                          - generic [ref=f1e642]:
                            - paragraph [ref=f1e643]: TEST ONLY synthetic other-sector fact
                            - generic [ref=f1e644]:
                              - generic [ref=f1e645]: AML_TECH_CERT_OTHER_SECTOR
                              - generic [ref=f1e646]: integer
                              - generic [ref=f1e647]: Not used by the governing fact settings
                            - paragraph [ref=f1e648]: Synthetic. Applies only to a different sector in the TEST fact settings.
                        - listitem [ref=f1e649]:
                          - generic [ref=f1e650]:
                            - paragraph [ref=f1e651]: TEST ONLY synthetic count (technical certification)
                            - generic [ref=f1e652]:
                              - generic [ref=f1e653]: AML_TECH_CERT_STR_COUNT
                              - generic [ref=f1e654]: integer
                              - generic [ref=f1e655]: Required
                              - generic [ref=f1e656]: "12"
                            - paragraph [ref=f1e657]: "Source: RETURN · TEST-AML-CLOSE-03A-AML_TECH_CERT_STR_COUNT"
                          - button "Update" [ref=f1e658] [cursor=pointer]
                        - listitem [ref=f1e659]:
                          - generic [ref=f1e660]:
                            - paragraph [ref=f1e661]: TEST ONLY synthetic category (technical certification)
                            - generic [ref=f1e662]:
                              - generic [ref=f1e663]: AML_TECH_CERT_TIER
                              - generic [ref=f1e664]: category
                            - paragraph [ref=f1e665]: Synthetic technical-certification fact. Not an FSRA requirement.
                          - button "Record" [ref=f1e666] [cursor=pointer]
                        - listitem [ref=f1e667]:
                          - generic [ref=f1e668]:
                            - paragraph [ref=f1e669]: TEST ONLY synthetic type-conflict fact
                            - generic [ref=f1e670]:
                              - generic [ref=f1e671]: AML_TECH_CERT_TYPE_CONFLICT
                              - generic [ref=f1e672]: integer
                              - generic [ref=f1e673]: Not used by the governing fact settings
                            - paragraph [ref=f1e674]: Synthetic. TEST fact settings declare a conflicting type.
                      - paragraph [ref=f1e675]: Facts support supervisory judgement. They are never treated as an answer, a rating or a conclusion.
                  - generic [ref=f1e676]:
                    - heading "Risk-factor applicability and materiality" [level=3] [ref=f1e678]
                    - generic [ref=f1e679]:
                      - paragraph [ref=f1e680]: Decided by the platform from calculation settings v1 pinned to this assessment (AML_TECH_CERT_METHOD v8). Later versions do not change it.
                      - generic [ref=f1e681]:
                        - generic [ref=f1e682]: "Status:"
                        - generic [ref=f1e683]: Governed
                      - table [ref=f1e686]:
                        - rowgroup [ref=f1e687]:
                          - row [ref=f1e688]:
                            - columnheader "Factor" [ref=f1e689]
                            - columnheader "Applicability" [ref=f1e690]
                            - columnheader "Materiality" [ref=f1e691]
                            - columnheader "Effect on rating" [ref=f1e692]
                            - columnheader "Reason" [ref=f1e693]
                        - rowgroup [ref=f1e694]:
                          - row [ref=f1e695]:
                            - cell "AML_TECH_CERT_CONTROL" [ref=f1e696]
                            - cell "Applicable" [ref=f1e697]
                            - cell "No materiality rule" [ref=f1e699]
                            - cell "Included in rating" [ref=f1e701]
                            - cell "The calculation settings apply this factor to every assessment. · No materiality rule is published for this factor, so it contributes as calculated." [ref=f1e703]
                          - row [ref=f1e704]:
                            - cell "AML_TECH_CERT_INHERENT" [ref=f1e705]
                            - cell "Applicable" [ref=f1e706]
                            - cell "Material" [ref=f1e708]
                            - cell "Included in rating" [ref=f1e710]
                            - cell "Fact AML_TECH_CERT_HAS_FLAG meets the applicability condition IS_TRUE. · Material because AML_TECH_CERT_STR_COUNT = 12 meets the governed threshold GTE 10." [ref=f1e712]
                          - row [ref=f1e713]:
                            - cell "AML_TECH_CERT_INHERENT_B" [ref=f1e714]
                            - cell "Applicable" [ref=f1e715]
                            - cell "Not material" [ref=f1e717]
                            - cell "Excluded — not material" [ref=f1e719]
                            - cell "The calculation settings apply this factor to every assessment. · Not material because AML_TECH_CERT_STR_COUNT = 12 does not meet the governed threshold GTE 50." [ref=f1e721]
                          - row [ref=f1e722]:
                            - cell "AML_TECH_CERT_INHERENT_C" [ref=f1e723]
                            - cell "Not applicable" [ref=f1e724]
                            - cell "Not evaluated" [ref=f1e726]
                            - cell "Not applicable" [ref=f1e728]
                            - cell "Sector VIRTUAL_ASSET_BUSINESS is not one of the sectors this factor applies to (INTERNATIONAL_BANKING). · Materiality is only decided for a factor that applies." [ref=f1e730]
                  - generic [ref=f1e731]:
                    - generic [ref=f1e732]:
                      - heading "Working file completion" [level=3] [ref=f1e734]
                      - generic [ref=f1e735]:
                        - generic [ref=f1e736]:
                          - progressbar [ref=f1e737]
                          - generic [ref=f1e739]: 0 / 4 dimensions assessed
                        - generic [ref=f1e740]:
                          - progressbar [ref=f1e741]
                          - generic [ref=f1e743]: 0 / 2 mandatory questions answered
                        - paragraph [ref=f1e744]: Every dimension and question below is configured on the methodology version attached to this assessment. Dimension codes cannot be invented — you record judgment against the configured methodology, and the database refuses submission while any mandatory question remains outstanding.
                    - generic [ref=f1e745]:
                      - heading "Control effectiveness0 / 1 assessed" [level=3] [ref=f1e747]:
                        - text: Control effectiveness
                        - generic [ref=f1e748]: 0 / 1 assessed
                      - heading [level=3] [ref=f1e752]:
                        - button "TEST ONLY control dimension weight 100 —" [ref=f1e753] [cursor=pointer]:
                          - generic [ref=f1e754]:
                            - generic [ref=f1e757]: TEST ONLY control dimension
                            - generic [ref=f1e758]: weight 100
                            - generic [ref=f1e759]: —
                    - generic [ref=f1e762]:
                      - heading "Inherent risk0 / 3 assessed" [level=3] [ref=f1e764]:
                        - text: Inherent risk
                        - generic [ref=f1e765]: 0 / 3 assessed
                      - generic [ref=f1e767]:
                        - heading [level=3] [ref=f1e769]:
                          - button "AML_TECH_CERT_INHERENT weight 40 —" [ref=f1e770] [cursor=pointer]:
                            - generic [ref=f1e771]:
                              - generic [ref=f1e774]: AML_TECH_CERT_INHERENT
                              - generic [ref=f1e775]: weight 40
                              - generic [ref=f1e776]: —
                        - heading [level=3] [ref=f1e780]:
                          - button "AML_TECH_CERT_INHERENT_B weight 30 —" [ref=f1e781] [cursor=pointer]:
                            - generic [ref=f1e782]:
                              - generic [ref=f1e785]: AML_TECH_CERT_INHERENT_B
                              - generic [ref=f1e786]: weight 30
                              - generic [ref=f1e787]: —
                        - heading [level=3] [ref=f1e791]:
                          - button "AML_TECH_CERT_INHERENT_C weight 30 —" [ref=f1e792] [cursor=pointer]:
                            - generic [ref=f1e793]:
                              - generic [ref=f1e796]: AML_TECH_CERT_INHERENT_C
                              - generic [ref=f1e797]: weight 30
                              - generic [ref=f1e798]: —
            - alert [ref=f1e801]:
              - heading "Not yet approved" [level=5] [ref=f1e804]
              - generic [ref=f1e805]: Ratings shown are provisional until the assessment is approved by a checker other than its maker.
```

# Test source

```ts
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
  89  |     // Applicability resolves automatically; the factor stays pending only on its materiality fact.
  90  |     await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT"]')).toContainText('meets the applicability condition', { timeout: 30_000 });
  91  |     await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT"]')).toContainText('Missing: AML_TECH_CERT_STR_COUNT');
  92  |     await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '12');
  93  |     await expect.poll(async () => (await factorRows(page)).AML_TECH_CERT_INHERENT_B, { timeout: 30_000 }).toBe('EXCLUDED_NOT_MATERIAL');
  94  | 
  95  |     const after = await factorRows(page);
  96  |     expect(after).toMatchObject({
  97  |       AML_TECH_CERT_INHERENT: 'INCLUDED',
  98  |       AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL',
  99  |       AML_TECH_CERT_INHERENT_C: 'NOT_APPLICABLE',
  100 |       AML_TECH_CERT_CONTROL: 'INCLUDED',
  101 |     });
  102 |     await expect(page.getByTestId('aml-factor-authority')).not.toContainText('waiting for information');
  103 |   });
  104 | 
  105 |   test('answer questions, calculate, reload: same result', async ({ page }) => {
  106 |     test.skip(!assessmentId, 'assessment not created');
  107 |     await loginAs(page, OFFICER);
  108 |     await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });
  109 |     await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
  110 | 
  111 |     // Open every dimension in the working file and answer each question.
  112 |     for (const t of await page.locator('[data-radix-collection-item][data-state="closed"]').filter({ hasText: /AML_TECH_CERT|TEST/ }).all()) {
  113 |       await t.click().catch(() => {});
  114 |     }
  115 |     const answers: Record<string, RegExp> = { 'AML-TC-IR-01': /Partially/i };
  116 |     const triggers = page.locator('button[id^="resp-"]');
  117 |     const n = await triggers.count();
> 118 |     expect(n, 'questions visible in the working file').toBeGreaterThan(0);
      |                                                        ^ Error: questions visible in the working file
  119 |     for (let i = 0; i < n; i++) {
  120 |       const trig = triggers.nth(i);
  121 |       const card = trig.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  122 |       const text = await card.innerText();
  123 |       const code = Object.keys(answers).find((k) => text.includes(k));
  124 |       await trig.click();
  125 |       await page.getByRole('option', { name: code ? answers[code] : /^Yes$/i }).first().click();
  126 |       const obs = card.locator('textarea');
  127 |       if (await obs.count()) await obs.first().fill('TEST ONLY observation — AML-CLOSE-03A');
  128 |       await card.getByRole('button', { name: 'Save response' }).click();
  129 |       await expect(card.getByRole('button', { name: 'Save response' })).toBeEnabled({ timeout: 20_000 });
  130 |     }
  131 | 
  132 |     await page.getByRole('tab', { name: 'Calculation' }).click();
  133 |     await page.getByRole('button', { name: 'Recalculate' }).click();
  134 |     const result = page.locator('[role="tabpanel"]', { hasText: 'Calculation / risk result' });
  135 |     await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
  136 |     const first = await result.innerText();
  137 | 
  138 |     await page.reload({ waitUntil: 'domcontentloaded' });
  139 |     await page.getByRole('tab', { name: 'Calculation' }).click();
  140 |     await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
  141 |     expect(await factorRows(page)).toMatchObject({ AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL' });
  142 | 
  143 |     const fa = await rpc(OFFICER, 'supervisory_assessment_factor_authority', { _assessment_id: assessmentId });
  144 |     const body = fa.body as { latest_run: { status: string; engine_version: string; matches_current_evaluation: boolean }; evaluation: { factors: Factor[] } };
  145 |     expect(body.latest_run.status).toBe('CALCULATED');
  146 |     expect(body.latest_run.engine_version).toBe('AML06.2');
  147 |     expect(body.latest_run.matches_current_evaluation).toBe(true);
  148 |     expect(first.length).toBeGreaterThan(0);
  149 |   });
  150 | });
  151 | 
  152 | test.describe('AML-CLOSE-03A security proofs for new routines', () => {
  153 |   const A = '8f6e487f-68c1-4038-b3e2-693a2d91a360';
  154 |   const URL_BASE = process.env.VITE_SUPABASE_URL as string;
  155 |   const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  156 |   const anon = (fn: string, body: unknown) => fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
  157 |     method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  158 |   });
  159 | 
  160 |   test('factor authority: out-of-scope personas and anonymous are refused', async () => {
  161 |     for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
  162 |       const r = await rpc(persona(p), 'supervisory_assessment_factor_authority', { _assessment_id: A });
  163 |       expect(r.ok, `${p} must be refused`).toBeFalsy();
  164 |     }
  165 |     expect((await anon('supervisory_assessment_factor_authority', { _assessment_id: A })).status).toBe(401);
  166 |   });
  167 | 
  168 |   test('applicability set: only configuration managers, only on drafts; anonymous refused', async () => {
  169 |     const C1 = '18ca681c-cc57-44b3-9d85-276b0b930d8c';
  170 |     for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
  171 |       const r = await rpc(persona(p), 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
  172 |       expect(r.ok, `${p} must be refused`).toBeFalsy();
  173 |     }
  174 |     const r = await rpc(OFFICER, 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
  175 |     expect(r.ok).toBeFalsy();
  176 |     expect(r.bodyText).toMatch(/only be edited while the configuration is a draft/);
  177 |     expect((await anon('supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] })).status).toBe(401);
  178 |   });
  179 | 
  180 |   test('internal readiness routine is not callable directly', async () => {
  181 |     const r = await rpc(persona('complaints_officer'), 'supervisory_assessment_readiness_internal', { _assessment_id: A });
  182 |     expect(r.ok).toBeFalsy();
  183 |     expect(r.bodyText).toMatch(/permission denied/);
  184 |   });
  185 | });
  186 | 
```