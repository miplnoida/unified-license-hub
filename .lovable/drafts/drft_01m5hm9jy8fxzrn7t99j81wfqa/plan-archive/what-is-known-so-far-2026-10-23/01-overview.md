Goal: check whether each Session 4 point has real Rodney Bay data on screen. If it does, write the narration script. Everything uses existing screens: no code changes, no new screens, no emails and no changes to records.

## What is known so far
| Session 4 point | Status |
|---|---|
| Complaints and market conduct | Ready: CMP-2026-000126 to 000129 have approved plans and recorded outcomes |
| Investigations and enforcement | Mostly ready: CI-CU-DEMO-2026-01 is open but can only be viewed, not moved forward. ENF-CU-DEMO-2026-01 is in remediation monitoring with an EC$25,000 penalty |
| Appeals | No appeal exists, and the appeal panel lacks enough members. It will be shown as a configured capability only |
| Portfolio intelligence and entity view | To check: `/conduct/entities/:id/360`, `/conduct` |
| Dashboards | To check: `/dashboard`, `/analytics` |
| Reports | To check: `/analytics` and the reporting pages |
| AI capabilities | To check: `/analytics/ai-insights`, `/analytics/ai-reports`, and the AI tab on complaints |
| Integrations and APIs | To check: `/admin/integration-logs`, `/admin/api-keys` (15 integrations, 2 active) |
| Audit and assurance | To check: `/admin/audit-logs`, `/admin/case-audit`, `/admin/audit-export` |

## Steps
1. **Check every page.** As Super Admin, open each page above, take a screenshot, and note the exact menu path, tab names, buttons and what Rodney Bay data appears. This is read-only.
2. **Report gaps honestly.** Where a page has no Rodney Bay data, say so and explain how to present it instead, for example using other entities or the configuration screens. I won't create records without asking you first.
3. **Write the script.** Create `demo/session-4-narration-script.md` and `.docx` with these steps:
   - one step per page I checked
   - login and menu path, and exactly what to click
   - natural, professional narration you can read aloud
   - what the audience should see on screen
   - a short fallback note for gaps
   - no wording like "fictional", "sample" or "test"
4. **Share** the Word file with you, plus a short list of anything that is not fully ready.

## Not changed
AML/CFT records, appeals, CMP-2026-000130 and enforcement case ENF-CU-DEMO-2026-01.
