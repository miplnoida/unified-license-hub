# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-aml-materiality-browser-journey.spec.ts >> AML-CLOSE-03A browser journey (TEST package) >> create assessment through the dialog; policy, methodology and settings resolve
- Location: e2e/cert-v2/09-aml-materiality-browser-journey.spec.ts:53:3

# Error details

```
TimeoutError: locator.click: Timeout 20000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /New assessment|Start assessment/i }).first()

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
                - link "Assessments" [disabled] [ref=f1e310]
          - generic [ref=f1e313]:
            - generic [ref=f1e315]:
              - heading "AML/CFT Risk Assessments" [level=1] [ref=f1e317]
              - generic [ref=f1e318]:
                - button "Refresh assessments" [ref=f1e319] [cursor=pointer]
                - button "New AML/CFT assessment" [ref=f1e320] [cursor=pointer]
            - generic [ref=f1e322]:
              - generic [ref=f1e323]:
                - textbox "Search reference or type…" [ref=f1e325]
                - combobox [ref=f1e326] [cursor=pointer]:
                  - generic: All statuses
                - generic [ref=f1e329]: 41 assessments
              - generic [ref=f1e331]:
                - table [ref=f1e333]:
                  - caption [ref=f1e334]: AML/CFT risk assessments
                  - rowgroup [ref=f1e335]:
                    - row [ref=f1e336]:
                      - columnheader [ref=f1e337]:
                        - 'button "Reference / subject: sort ascending" [ref=f1e338] [cursor=pointer]':
                          - generic [ref=f1e339]: Reference / subject
                      - columnheader [ref=f1e343]:
                        - 'button "Type / trigger: sort ascending" [ref=f1e344] [cursor=pointer]':
                          - generic [ref=f1e345]: Type / trigger
                      - columnheader [ref=f1e349]:
                        - 'button "Ratings: sort ascending" [ref=f1e350] [cursor=pointer]':
                          - generic [ref=f1e351]: Ratings
                      - columnheader [ref=f1e355]:
                        - 'button "Status: sort ascending" [ref=f1e356] [cursor=pointer]':
                          - generic [ref=f1e357]: Status
                      - columnheader [ref=f1e361]:
                        - 'button "Period / methodology: sort ascending" [ref=f1e362] [cursor=pointer]':
                          - generic [ref=f1e363]: Period / methodology
                      - columnheader "Action" [ref=f1e367]
                  - rowgroup [ref=f1e368]:
                    - row [ref=f1e369]:
                      - cell "SUP-AML_CFT-2026-00916 Copy assessment id Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO) Current" [ref=f1e370]:
                        - generic [ref=f1e371]:
                          - generic [ref=f1e372]:
                            - generic [ref=f1e373]: SUP-AML_CFT-2026-00916
                            - button "Copy assessment id" [ref=f1e374] [cursor=pointer]
                          - generic [ref=f1e376]:
                            - generic [ref=f1e377]: Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)
                            - generic [ref=f1e378]: Current
                      - cell "Periodic Periodic" [ref=f1e379]:
                        - generic [ref=f1e380]: Periodic
                        - generic [ref=f1e381]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e382]':
                        - generic [ref=f1e383]: —
                        - generic [ref=f1e384]: "I: — · C: —"
                      - cell "Draft" [ref=f1e385]
                      - cell "Jan 01, 2026 → Jun 30, 2026 v8" [ref=f1e387]:
                        - generic [ref=f1e388]: Jan 01, 2026 → Jun 30, 2026
                        - generic [ref=f1e389]: v8
                      - cell [ref=f1e390]:
                        - link "Open" [ref=f1e391] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/7aaa0526-a334-48c4-a3ac-9ffb5f9a90e1
                    - row [ref=f1e392]:
                      - cell "SUP-AML_CFT-2026-00915 Copy assessment id Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO) Current" [ref=f1e393]:
                        - generic [ref=f1e394]:
                          - generic [ref=f1e395]:
                            - generic [ref=f1e396]: SUP-AML_CFT-2026-00915
                            - button "Copy assessment id" [ref=f1e397] [cursor=pointer]
                          - generic [ref=f1e399]:
                            - generic [ref=f1e400]: Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)
                            - generic [ref=f1e401]: Current
                      - cell "Periodic Periodic" [ref=f1e402]:
                        - generic [ref=f1e403]: Periodic
                        - generic [ref=f1e404]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e405]':
                        - generic [ref=f1e406]: —
                        - generic [ref=f1e407]: "I: — · C: —"
                      - cell "Draft" [ref=f1e408]
                      - cell "Jan 01, 2026 → Jun 30, 2026 v8" [ref=f1e410]:
                        - generic [ref=f1e411]: Jan 01, 2026 → Jun 30, 2026
                        - generic [ref=f1e412]: v8
                      - cell [ref=f1e413]:
                        - link "Open" [ref=f1e414] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/8f6e487f-68c1-4038-b3e2-693a2d91a360
                    - row [ref=f1e415]:
                      - cell "SUP-AML_CFT-2026-00914 Copy assessment id Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO) Current" [ref=f1e416]:
                        - generic [ref=f1e417]:
                          - generic [ref=f1e418]:
                            - generic [ref=f1e419]: SUP-AML_CFT-2026-00914
                            - button "Copy assessment id" [ref=f1e420] [cursor=pointer]
                          - generic [ref=f1e422]:
                            - generic [ref=f1e423]: Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)
                            - generic [ref=f1e424]: Current
                      - cell "Periodic Periodic" [ref=f1e425]:
                        - generic [ref=f1e426]: Periodic
                        - generic [ref=f1e427]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e428]':
                        - generic [ref=f1e429]: —
                        - generic [ref=f1e430]: "I: — · C: —"
                      - cell "Draft" [ref=f1e431]
                      - cell "Jan 01, 2026 → Jun 30, 2026 v6" [ref=f1e433]:
                        - generic [ref=f1e434]: Jan 01, 2026 → Jun 30, 2026
                        - generic [ref=f1e435]: v6
                      - cell [ref=f1e436]:
                        - link "Open" [ref=f1e437] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/18090f2f-9fec-49fa-8853-25928dc86392
                    - row [ref=f1e438]:
                      - cell "SUP-AML_CFT-2026-00913 Copy assessment id Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO) Current" [ref=f1e439]:
                        - generic [ref=f1e440]:
                          - generic [ref=f1e441]:
                            - generic [ref=f1e442]: SUP-AML_CFT-2026-00913
                            - button "Copy assessment id" [ref=f1e443] [cursor=pointer]
                          - generic [ref=f1e445]:
                            - generic [ref=f1e446]: Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)
                            - generic [ref=f1e447]: Current
                      - cell "Periodic Periodic" [ref=f1e448]:
                        - generic [ref=f1e449]: Periodic
                        - generic [ref=f1e450]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e451]':
                        - generic [ref=f1e452]: —
                        - generic [ref=f1e453]: "I: — · C: —"
                      - cell "Draft" [ref=f1e454]
                      - cell "Jan 01, 2026 → Jun 30, 2026 v6" [ref=f1e456]:
                        - generic [ref=f1e457]: Jan 01, 2026 → Jun 30, 2026
                        - generic [ref=f1e458]: v6
                      - cell [ref=f1e459]:
                        - link "Open" [ref=f1e460] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/f54026ef-00a4-4ce4-96a1-26797ad7dde5
                    - row [ref=f1e461]:
                      - cell "SUP-AML_CFT-2026-00838 Copy assessment id Helen Digital Assets Ltd (SAINT-LUCIA-FSRA-DEMO) Current" [ref=f1e462]:
                        - generic [ref=f1e463]:
                          - generic [ref=f1e464]:
                            - generic [ref=f1e465]: SUP-AML_CFT-2026-00838
                            - button "Copy assessment id" [ref=f1e466] [cursor=pointer]
                          - generic [ref=f1e468]:
                            - generic [ref=f1e469]: Helen Digital Assets Ltd (SAINT-LUCIA-FSRA-DEMO)
                            - generic [ref=f1e470]: Current
                      - cell "Periodic Periodic" [ref=f1e471]:
                        - generic [ref=f1e472]: Periodic
                        - generic [ref=f1e473]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e474]':
                        - generic [ref=f1e475]: —
                        - generic [ref=f1e476]: "I: — · C: —"
                      - cell "Draft" [ref=f1e477]
                      - cell "Oct 03, 2025 → Oct 02, 2026 v2" [ref=f1e479]:
                        - generic [ref=f1e480]: Oct 03, 2025 → Oct 02, 2026
                        - generic [ref=f1e481]: v2
                      - cell [ref=f1e482]:
                        - link "Open" [ref=f1e483] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/66cc17e3-f944-4b93-be22-8857565a1213
                    - row [ref=f1e484]:
                      - cell "SUP-AML_CFT-2026-00837 Copy assessment id — Current" [ref=f1e485]:
                        - generic [ref=f1e486]:
                          - generic [ref=f1e487]:
                            - generic [ref=f1e488]: SUP-AML_CFT-2026-00837
                            - button "Copy assessment id" [ref=f1e489] [cursor=pointer]
                          - generic [ref=f1e491]:
                            - generic [ref=f1e492]: —
                            - generic [ref=f1e493]: Current
                      - cell "Initial Baseline Periodic" [ref=f1e494]:
                        - generic [ref=f1e495]: Initial Baseline
                        - generic [ref=f1e496]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e497]':
                        - generic [ref=f1e498]: —
                        - generic [ref=f1e499]: "I: — · C: —"
                      - cell "Draft" [ref=f1e500]
                      - cell "Sep 29, 2025 → Sep 28, 2026 v1.0" [ref=f1e502]:
                        - generic [ref=f1e503]: Sep 29, 2025 → Sep 28, 2026
                        - generic [ref=f1e504]: v1.0
                      - cell [ref=f1e505]:
                        - link "Open" [ref=f1e506] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/054b536a-2219-405a-bcc0-a8be1a3d1ebd
                    - row [ref=f1e507]:
                      - cell "SUP-AML_CFT-2026-00836 Copy assessment id — Current" [ref=f1e508]:
                        - generic [ref=f1e509]:
                          - generic [ref=f1e510]:
                            - generic [ref=f1e511]: SUP-AML_CFT-2026-00836
                            - button "Copy assessment id" [ref=f1e512] [cursor=pointer]
                          - generic [ref=f1e514]:
                            - generic [ref=f1e515]: —
                            - generic [ref=f1e516]: Current
                      - cell "Initial Baseline Periodic" [ref=f1e517]:
                        - generic [ref=f1e518]: Initial Baseline
                        - generic [ref=f1e519]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e520]':
                        - generic [ref=f1e521]: —
                        - generic [ref=f1e522]: "I: — · C: —"
                      - cell "Draft" [ref=f1e523]
                      - cell "Aug 06, 2024 → Sep 27, 2026 v1.0" [ref=f1e525]:
                        - generic [ref=f1e526]: Aug 06, 2024 → Sep 27, 2026
                        - generic [ref=f1e527]: v1.0
                      - cell [ref=f1e528]:
                        - link "Open" [ref=f1e529] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/d81e0a9e-f36b-456f-bdde-48611b54cab4
                    - row [ref=f1e530]:
                      - cell "SUP-AML_CFT-2026-00830 Copy assessment id DEMO AML 22 Pigeon Island Payment Bank Ltd Current" [ref=f1e531]:
                        - generic [ref=f1e532]:
                          - generic [ref=f1e533]:
                            - generic [ref=f1e534]: SUP-AML_CFT-2026-00830
                            - button "Copy assessment id" [ref=f1e535] [cursor=pointer]
                          - generic [ref=f1e537]:
                            - generic [ref=f1e538]: DEMO AML 22 Pigeon Island Payment Bank Ltd
                            - generic [ref=f1e539]: Current
                      - cell "Periodic Periodic" [ref=f1e540]:
                        - generic [ref=f1e541]: Periodic
                        - generic [ref=f1e542]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e543]':
                        - generic [ref=f1e544]: High
                        - generic [ref=f1e545]: "I: — · C: —"
                      - cell "Approved Approved Sep 12, 2026" [ref=f1e546]:
                        - generic [ref=f1e547]: Approved
                        - generic [ref=f1e548]: Approved Sep 12, 2026
                      - cell "Sep 12, 2025 → Sep 11, 2026 v1.0" [ref=f1e549]:
                        - generic [ref=f1e550]: Sep 12, 2025 → Sep 11, 2026
                        - generic [ref=f1e551]: v1.0
                      - cell [ref=f1e552]:
                        - link "Open" [ref=f1e553] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/7e0a9271-8696-4242-a905-fd8cb66c938f
                    - row [ref=f1e554]:
                      - cell "SUP-AML_CFT-2026-00744 Copy assessment id DEMO AML 06 Rodney Bay Payments Ltd Current" [ref=f1e555]:
                        - generic [ref=f1e556]:
                          - generic [ref=f1e557]:
                            - generic [ref=f1e558]: SUP-AML_CFT-2026-00744
                            - button "Copy assessment id" [ref=f1e559] [cursor=pointer]
                          - generic [ref=f1e561]:
                            - generic [ref=f1e562]: DEMO AML 06 Rodney Bay Payments Ltd
                            - generic [ref=f1e563]: Current
                      - cell "Periodic Periodic" [ref=f1e564]:
                        - generic [ref=f1e565]: Periodic
                        - generic [ref=f1e566]: Periodic
                      - 'cell "Low I: — · C: —" [ref=f1e567]':
                        - generic [ref=f1e568]: Low
                        - generic [ref=f1e569]: "I: — · C: —"
                      - cell "Approved Approved Sep 10, 2026" [ref=f1e570]:
                        - generic [ref=f1e571]: Approved
                        - generic [ref=f1e572]: Approved Sep 10, 2026
                      - cell "Jan 01, 2026 → Sep 10, 2026 v1.0" [ref=f1e573]:
                        - generic [ref=f1e574]: Jan 01, 2026 → Sep 10, 2026
                        - generic [ref=f1e575]: v1.0
                      - cell [ref=f1e576]:
                        - link "Open" [ref=f1e577] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf
                    - row [ref=f1e578]:
                      - cell "SUP-AML_CFT-2026-00735 Copy assessment id DEMO AML 01 Castries Remittance Services Ltd Current" [ref=f1e579]:
                        - generic [ref=f1e580]:
                          - generic [ref=f1e581]:
                            - generic [ref=f1e582]: SUP-AML_CFT-2026-00735
                            - button "Copy assessment id" [ref=f1e583] [cursor=pointer]
                          - generic [ref=f1e585]:
                            - generic [ref=f1e586]: DEMO AML 01 Castries Remittance Services Ltd
                            - generic [ref=f1e587]: Current
                      - cell "Periodic Periodic" [ref=f1e588]:
                        - generic [ref=f1e589]: Periodic
                        - generic [ref=f1e590]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e591]':
                        - generic [ref=f1e592]: —
                        - generic [ref=f1e593]: "I: — · C: —"
                      - cell "Draft" [ref=f1e594]
                      - cell "Sep 10, 2025 → Sep 09, 2026 v1.0" [ref=f1e596]:
                        - generic [ref=f1e597]: Sep 10, 2025 → Sep 09, 2026
                        - generic [ref=f1e598]: v1.0
                      - cell [ref=f1e599]:
                        - link "Open" [ref=f1e600] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/3709eb06-31d1-4efd-be6c-fad3dbf73111
                    - row [ref=f1e601]:
                      - cell "SUP-AML_CFT-2026-00736 Copy assessment id DEMO AML 02 Vieux Fort Money Transfer Ltd Current" [ref=f1e602]:
                        - generic [ref=f1e603]:
                          - generic [ref=f1e604]:
                            - generic [ref=f1e605]: SUP-AML_CFT-2026-00736
                            - button "Copy assessment id" [ref=f1e606] [cursor=pointer]
                          - generic [ref=f1e608]:
                            - generic [ref=f1e609]: DEMO AML 02 Vieux Fort Money Transfer Ltd
                            - generic [ref=f1e610]: Current
                      - cell "Periodic Periodic" [ref=f1e611]:
                        - generic [ref=f1e612]: Periodic
                        - generic [ref=f1e613]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e614]':
                        - generic [ref=f1e615]: —
                        - generic [ref=f1e616]: "I: — · C: —"
                      - cell "Submitted" [ref=f1e617]
                      - cell "Sep 10, 2025 → Sep 09, 2026 v1.0" [ref=f1e619]:
                        - generic [ref=f1e620]: Sep 10, 2025 → Sep 09, 2026
                        - generic [ref=f1e621]: v1.0
                      - cell [ref=f1e622]:
                        - link "Open" [ref=f1e623] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/f2910beb-2c79-49cb-bdb9-0ecf2dd3f885
                    - row [ref=f1e624]:
                      - cell "SUP-AML_CFT-2026-00737 Copy assessment id DEMO AML 03 Soufriere Exchange Bureau Ltd Current" [ref=f1e625]:
                        - generic [ref=f1e626]:
                          - generic [ref=f1e627]:
                            - generic [ref=f1e628]: SUP-AML_CFT-2026-00737
                            - button "Copy assessment id" [ref=f1e629] [cursor=pointer]
                          - generic [ref=f1e631]:
                            - generic [ref=f1e632]: DEMO AML 03 Soufriere Exchange Bureau Ltd
                            - generic [ref=f1e633]: Current
                      - cell "Periodic Periodic" [ref=f1e634]:
                        - generic [ref=f1e635]: Periodic
                        - generic [ref=f1e636]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e637]':
                        - generic [ref=f1e638]: —
                        - generic [ref=f1e639]: "I: — · C: —"
                      - cell "Returned For Revision" [ref=f1e640]
                      - cell "Sep 10, 2025 → Sep 09, 2026 v1.0" [ref=f1e642]:
                        - generic [ref=f1e643]: Sep 10, 2025 → Sep 09, 2026
                        - generic [ref=f1e644]: v1.0
                      - cell [ref=f1e645]:
                        - link "Open" [ref=f1e646] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/8591b783-0a86-476e-9c0b-745d17d46ca6
                    - row [ref=f1e647]:
                      - cell "SUP-AML_CFT-2026-00738 Copy assessment id DEMO AML 04 Marigot Credit Union Current" [ref=f1e648]:
                        - generic [ref=f1e649]:
                          - generic [ref=f1e650]:
                            - generic [ref=f1e651]: SUP-AML_CFT-2026-00738
                            - button "Copy assessment id" [ref=f1e652] [cursor=pointer]
                          - generic [ref=f1e654]:
                            - generic [ref=f1e655]: DEMO AML 04 Marigot Credit Union
                            - generic [ref=f1e656]: Current
                      - cell "Periodic Periodic" [ref=f1e657]:
                        - generic [ref=f1e658]: Periodic
                        - generic [ref=f1e659]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e660]':
                        - generic [ref=f1e661]: —
                        - generic [ref=f1e662]: "I: — · C: —"
                      - cell "Submitted" [ref=f1e663]
                      - cell "Sep 10, 2025 → Sep 09, 2026 v1.0" [ref=f1e665]:
                        - generic [ref=f1e666]: Sep 10, 2025 → Sep 09, 2026
                        - generic [ref=f1e667]: v1.0
                      - cell [ref=f1e668]:
                        - link "Open" [ref=f1e669] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/b3905c17-b8ab-4709-8531-a4356c60fe7a
                    - row [ref=f1e670]:
                      - cell "SUP-AML_CFT-2026-00739 Copy assessment id DEMO AML 05 Dennery Cooperative Credit Union Current" [ref=f1e671]:
                        - generic [ref=f1e672]:
                          - generic [ref=f1e673]:
                            - generic [ref=f1e674]: SUP-AML_CFT-2026-00739
                            - button "Copy assessment id" [ref=f1e675] [cursor=pointer]
                          - generic [ref=f1e677]:
                            - generic [ref=f1e678]: DEMO AML 05 Dennery Cooperative Credit Union
                            - generic [ref=f1e679]: Current
                      - cell "Periodic Periodic" [ref=f1e680]:
                        - generic [ref=f1e681]: Periodic
                        - generic [ref=f1e682]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e683]':
                        - generic [ref=f1e684]: —
                        - generic [ref=f1e685]: "I: — · C: —"
                      - cell "Draft" [ref=f1e686]
                      - cell "Sep 10, 2025 → Sep 09, 2026 v1.0" [ref=f1e688]:
                        - generic [ref=f1e689]: Sep 10, 2025 → Sep 09, 2026
                        - generic [ref=f1e690]: v1.0
                      - cell [ref=f1e691]:
                        - link "Open" [ref=f1e692] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/093b4f2b-5017-49fc-aa9f-026f21d15a0f
                    - row [ref=f1e693]:
                      - cell "SUP-AML_CFT-2026-00351 Copy assessment id DEMO AML 02 Vieux Fort Money Transfer Ltd Current" [ref=f1e694]:
                        - generic [ref=f1e695]:
                          - generic [ref=f1e696]:
                            - generic [ref=f1e697]: SUP-AML_CFT-2026-00351
                            - button "Copy assessment id" [ref=f1e698] [cursor=pointer]
                          - generic [ref=f1e700]:
                            - generic [ref=f1e701]: DEMO AML 02 Vieux Fort Money Transfer Ltd
                            - generic [ref=f1e702]: Current
                      - cell "Periodic Periodic" [ref=f1e703]:
                        - generic [ref=f1e704]: Periodic
                        - generic [ref=f1e705]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e706]':
                        - generic [ref=f1e707]: —
                        - generic [ref=f1e708]: "I: — · C: —"
                      - cell "Draft" [ref=f1e709]
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e711]:
                        - generic [ref=f1e712]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e713]: v1.0
                      - cell [ref=f1e714]:
                        - link "Open" [ref=f1e715] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/219e68df-f799-4cc6-9004-f07a94a8621c
                    - row [ref=f1e716]:
                      - cell "SUP-AML_CFT-2026-00352 Copy assessment id DEMO AML 03 Soufriere Exchange Bureau Ltd Current" [ref=f1e717]:
                        - generic [ref=f1e718]:
                          - generic [ref=f1e719]:
                            - generic [ref=f1e720]: SUP-AML_CFT-2026-00352
                            - button "Copy assessment id" [ref=f1e721] [cursor=pointer]
                          - generic [ref=f1e723]:
                            - generic [ref=f1e724]: DEMO AML 03 Soufriere Exchange Bureau Ltd
                            - generic [ref=f1e725]: Current
                      - cell "Periodic Periodic" [ref=f1e726]:
                        - generic [ref=f1e727]: Periodic
                        - generic [ref=f1e728]: Periodic
                      - 'cell "— I: — · C: —" [ref=f1e729]':
                        - generic [ref=f1e730]: —
                        - generic [ref=f1e731]: "I: — · C: —"
                      - cell "Submitted" [ref=f1e732]
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e734]:
                        - generic [ref=f1e735]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e736]: v1.0
                      - cell [ref=f1e737]:
                        - link "Open" [ref=f1e738] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/d967b17c-ede5-46b4-9762-a641ba785990
                    - row [ref=f1e739]:
                      - cell "SUP-AML_CFT-2026-00353 Copy assessment id DEMO AML 04 Marigot Credit Union Current" [ref=f1e740]:
                        - generic [ref=f1e741]:
                          - generic [ref=f1e742]:
                            - generic [ref=f1e743]: SUP-AML_CFT-2026-00353
                            - button "Copy assessment id" [ref=f1e744] [cursor=pointer]
                          - generic [ref=f1e746]:
                            - generic [ref=f1e747]: DEMO AML 04 Marigot Credit Union
                            - generic [ref=f1e748]: Current
                      - cell "Periodic Periodic" [ref=f1e749]:
                        - generic [ref=f1e750]: Periodic
                        - generic [ref=f1e751]: Periodic
                      - 'cell "Low I: — · C: —" [ref=f1e752]':
                        - generic [ref=f1e753]: Low
                        - generic [ref=f1e754]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e755]:
                        - generic [ref=f1e756]: Approved
                        - generic [ref=f1e757]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e758]:
                        - generic [ref=f1e759]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e760]: v1.0
                      - cell [ref=f1e761]:
                        - link "Open" [ref=f1e762] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/5934f1c5-59bd-444c-929d-209212c79292
                    - row [ref=f1e763]:
                      - cell "SUP-AML_CFT-2026-00354 Copy assessment id DEMO AML 05 Dennery Cooperative Credit Union Current" [ref=f1e764]:
                        - generic [ref=f1e765]:
                          - generic [ref=f1e766]:
                            - generic [ref=f1e767]: SUP-AML_CFT-2026-00354
                            - button "Copy assessment id" [ref=f1e768] [cursor=pointer]
                          - generic [ref=f1e770]:
                            - generic [ref=f1e771]: DEMO AML 05 Dennery Cooperative Credit Union
                            - generic [ref=f1e772]: Current
                      - cell "Periodic Periodic" [ref=f1e773]:
                        - generic [ref=f1e774]: Periodic
                        - generic [ref=f1e775]: Periodic
                      - 'cell "Moderate I: — · C: —" [ref=f1e776]':
                        - generic [ref=f1e777]: Moderate
                        - generic [ref=f1e778]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e779]:
                        - generic [ref=f1e780]: Approved
                        - generic [ref=f1e781]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e782]:
                        - generic [ref=f1e783]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e784]: v1.0
                      - cell [ref=f1e785]:
                        - link "Open" [ref=f1e786] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/b5436967-82e9-42d4-aa5a-b349c1e899d7
                    - row [ref=f1e787]:
                      - cell "SUP-AML_CFT-2026-00355 Copy assessment id DEMO AML 06 Rodney Bay Payments Ltd" [ref=f1e788]:
                        - generic [ref=f1e789]:
                          - generic [ref=f1e790]:
                            - generic [ref=f1e791]: SUP-AML_CFT-2026-00355
                            - button "Copy assessment id" [ref=f1e792] [cursor=pointer]
                          - generic [ref=f1e793]: DEMO AML 06 Rodney Bay Payments Ltd
                      - cell "Periodic Periodic" [ref=f1e796]:
                        - generic [ref=f1e797]: Periodic
                        - generic [ref=f1e798]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e799]':
                        - generic [ref=f1e800]: High
                        - generic [ref=f1e801]: "I: — · C: —"
                      - cell "Superseded Approved Sep 03, 2026" [ref=f1e802]:
                        - generic [ref=f1e803]: Superseded
                        - generic [ref=f1e804]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e805]:
                        - generic [ref=f1e806]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e807]: v1.0
                      - cell [ref=f1e808]:
                        - link "Open" [ref=f1e809] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/20813efc-4af1-4b33-87c7-3719fa2fa00c
                    - row [ref=f1e810]:
                      - cell "SUP-AML_CFT-2026-00356 Copy assessment id DEMO AML 07 Gros Islet Virtual Assets Ltd" [ref=f1e811]:
                        - generic [ref=f1e812]:
                          - generic [ref=f1e813]:
                            - generic [ref=f1e814]: SUP-AML_CFT-2026-00356
                            - button "Copy assessment id" [ref=f1e815] [cursor=pointer]
                          - generic [ref=f1e816]: DEMO AML 07 Gros Islet Virtual Assets Ltd
                      - cell "Periodic Periodic" [ref=f1e819]:
                        - generic [ref=f1e820]: Periodic
                        - generic [ref=f1e821]: Periodic
                      - 'cell "Moderate I: — · C: —" [ref=f1e822]':
                        - generic [ref=f1e823]: Moderate
                        - generic [ref=f1e824]: "I: — · C: —"
                      - cell "Superseded Approved Sep 03, 2026" [ref=f1e825]:
                        - generic [ref=f1e826]: Superseded
                        - generic [ref=f1e827]: Approved Sep 03, 2026
                      - cell "Sep 03, 2024 → Sep 02, 2025 v1.0" [ref=f1e828]:
                        - generic [ref=f1e829]: Sep 03, 2024 → Sep 02, 2025
                        - generic [ref=f1e830]: v1.0
                      - cell [ref=f1e831]:
                        - link "Open" [ref=f1e832] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/0b3ae51a-cb9a-4950-ba91-7a4dca93a368
                    - row [ref=f1e833]:
                      - cell "SUP-AML_CFT-2026-00357 Copy assessment id DEMO AML 07 Gros Islet Virtual Assets Ltd Current" [ref=f1e834]:
                        - generic [ref=f1e835]:
                          - generic [ref=f1e836]:
                            - generic [ref=f1e837]: SUP-AML_CFT-2026-00357
                            - button "Copy assessment id" [ref=f1e838] [cursor=pointer]
                          - generic [ref=f1e840]:
                            - generic [ref=f1e841]: DEMO AML 07 Gros Islet Virtual Assets Ltd
                            - generic [ref=f1e842]: Current
                      - cell "Periodic Periodic" [ref=f1e843]:
                        - generic [ref=f1e844]: Periodic
                        - generic [ref=f1e845]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e846]':
                        - generic [ref=f1e847]: High
                        - generic [ref=f1e848]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e849]:
                        - generic [ref=f1e850]: Approved
                        - generic [ref=f1e851]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e852]:
                        - generic [ref=f1e853]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e854]: v1.0
                      - cell [ref=f1e855]:
                        - link "Open" [ref=f1e856] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/a9dc8604-c700-4475-9155-af059a6ae14b
                    - row [ref=f1e857]:
                      - cell "SUP-AML_CFT-2026-00358 Copy assessment id DEMO AML 08 Choiseul Cash Services Ltd Current" [ref=f1e858]:
                        - generic [ref=f1e859]:
                          - generic [ref=f1e860]:
                            - generic [ref=f1e861]: SUP-AML_CFT-2026-00358
                            - button "Copy assessment id" [ref=f1e862] [cursor=pointer]
                          - generic [ref=f1e864]:
                            - generic [ref=f1e865]: DEMO AML 08 Choiseul Cash Services Ltd
                            - generic [ref=f1e866]: Current
                      - cell "Periodic Periodic" [ref=f1e867]:
                        - generic [ref=f1e868]: Periodic
                        - generic [ref=f1e869]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e870]':
                        - generic [ref=f1e871]: High
                        - generic [ref=f1e872]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e873]:
                        - generic [ref=f1e874]: Approved
                        - generic [ref=f1e875]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e876]:
                        - generic [ref=f1e877]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e878]: v1.0
                      - cell [ref=f1e879]:
                        - link "Open" [ref=f1e880] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/74f41c39-680f-45c6-a17d-24c519249661
                    - row [ref=f1e881]:
                      - cell "SUP-AML_CFT-2026-00359 Copy assessment id DEMO AML 09 Anse La Raye Remittance Ltd Current" [ref=f1e882]:
                        - generic [ref=f1e883]:
                          - generic [ref=f1e884]:
                            - generic [ref=f1e885]: SUP-AML_CFT-2026-00359
                            - button "Copy assessment id" [ref=f1e886] [cursor=pointer]
                          - generic [ref=f1e888]:
                            - generic [ref=f1e889]: DEMO AML 09 Anse La Raye Remittance Ltd
                            - generic [ref=f1e890]: Current
                      - cell "Periodic Periodic" [ref=f1e891]:
                        - generic [ref=f1e892]: Periodic
                        - generic [ref=f1e893]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e894]':
                        - generic [ref=f1e895]: High
                        - generic [ref=f1e896]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e897]:
                        - generic [ref=f1e898]: Approved
                        - generic [ref=f1e899]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e900]:
                        - generic [ref=f1e901]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e902]: v1.0
                      - cell [ref=f1e903]:
                        - link "Open" [ref=f1e904] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/4e0e0087-e2d7-4e84-b97a-42b506bdf033
                    - row [ref=f1e905]:
                      - cell "SUP-AML_CFT-2026-00360 Copy assessment id DEMO AML 10 Laborie Money Services Ltd Current" [ref=f1e906]:
                        - generic [ref=f1e907]:
                          - generic [ref=f1e908]:
                            - generic [ref=f1e909]: SUP-AML_CFT-2026-00360
                            - button "Copy assessment id" [ref=f1e910] [cursor=pointer]
                          - generic [ref=f1e912]:
                            - generic [ref=f1e913]: DEMO AML 10 Laborie Money Services Ltd
                            - generic [ref=f1e914]: Current
                      - cell "Periodic Periodic" [ref=f1e915]:
                        - generic [ref=f1e916]: Periodic
                        - generic [ref=f1e917]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e918]':
                        - generic [ref=f1e919]: High
                        - generic [ref=f1e920]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e921]:
                        - generic [ref=f1e922]: Approved
                        - generic [ref=f1e923]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e924]:
                        - generic [ref=f1e925]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e926]: v1.0
                      - cell [ref=f1e927]:
                        - link "Open" [ref=f1e928] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/8f78c730-284f-4744-a861-43db211ffd96
                    - row [ref=f1e929]:
                      - cell "SUP-AML_CFT-2026-00361 Copy assessment id DEMO AML 11 Micoud Foreign Exchange Ltd Current" [ref=f1e930]:
                        - generic [ref=f1e931]:
                          - generic [ref=f1e932]:
                            - generic [ref=f1e933]: SUP-AML_CFT-2026-00361
                            - button "Copy assessment id" [ref=f1e934] [cursor=pointer]
                          - generic [ref=f1e936]:
                            - generic [ref=f1e937]: DEMO AML 11 Micoud Foreign Exchange Ltd
                            - generic [ref=f1e938]: Current
                      - cell "Periodic Periodic" [ref=f1e939]:
                        - generic [ref=f1e940]: Periodic
                        - generic [ref=f1e941]: Periodic
                      - 'cell "High I: — · C: —" [ref=f1e942]':
                        - generic [ref=f1e943]: High
                        - generic [ref=f1e944]: "I: — · C: —"
                      - cell "Approved Approved Sep 03, 2026" [ref=f1e945]:
                        - generic [ref=f1e946]: Approved
                        - generic [ref=f1e947]: Approved Sep 03, 2026
                      - cell "Sep 03, 2025 → Sep 02, 2026 v1.0" [ref=f1e948]:
                        - generic [ref=f1e949]: Sep 03, 2025 → Sep 02, 2026
                        - generic [ref=f1e950]: v1.0
                      - cell [ref=f1e951]:
                        - link "Open" [ref=f1e952] [cursor=pointer]:
                          - /url: /supervision/aml/assessments/7d94d34b-a177-4da4-9ff3-10473cf6c669
                - generic [ref=f1e953]:
                  - paragraph [ref=f1e954]: Showing 1–25 of 41
                  - generic [ref=f1e955]:
                    - combobox "Rows per page" [ref=f1e956] [cursor=pointer]:
                      - generic: 25 / page
                    - generic [ref=f1e959]:
                      - button "First page" [disabled]
                      - button "Previous page" [disabled]
                      - generic [ref=f1e960]: Page 1 of 2
                      - button "Next page" [ref=f1e961] [cursor=pointer]
                      - button "Last page" [ref=f1e962] [cursor=pointer]
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
> 56  |     await page.getByRole('button', { name: /New assessment|Start assessment/i }).first().click();
      |                                                                                          ^ TimeoutError: locator.click: Timeout 20000ms exceeded.
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
  89  |     await expect.poll(async () => (await factorRows(page)).AML_TECH_CERT_INHERENT, { timeout: 30_000 }).not.toBe('PENDING_INFORMATION');
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
```