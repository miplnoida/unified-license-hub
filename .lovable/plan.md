# Fix: "Accept and confirm" on supervisory triage is blocked by an override-reason error

## What is happening (confirmed)

On the complaint Triage tab, pressing **Accept and confirm** fails with
"A reason of at least 10 characters is required to change the triage recommendation",
even though the officer changed nothing and no reason box is shown.

Confirmed cause:

- No complaint in the system has an automated triage recommendation (0 rows in the
  triage evaluations table with source `auto` / `auto_retry`), and the archived
  original triage values carry no priority either.
- The backend confirm routine decides "this is a material override" by comparing the
  submitted values against the automated recommendation. When there is no
  recommendation, the comparison is "value vs nothing", which it treats as a change —
  so every first-time confirmation is classified as an override and demands a written
  reason plus override authority.
- The screen uses the correct rule (a change only counts when there is a
  recommendation value to differ from), so it shows the plain "Accept and confirm"
  button and no reason field. Screen and server disagree, and triage cannot be
  confirmed at all.

## Fix

1. **Backend (the real fix).** In `public.complaint_triage_confirm`, treat a dimension
   as a material override only when a comparable prior recommendation value actually
   exists. If there is no automated recommendation for that dimension, recording the
   supervisor's value is a first confirmation, not an override — status `CONFIRMED`, no
   reason required, no override permission required.
   Unchanged: confirming `CONFIRMED_SYSTEMIC` still always requires override authority
   and a written justification; genuine departures from an existing recommendation still
   require both; jurisdiction gate, freshness check, evaluation ledger entry,
   notification and audit log all stay exactly as they are.

2. **Screen (alignment only).** In `src/components/complaints/triage/TriagePanel.tsx`,
   when no recommendation exists, say so plainly next to the confirm action ("First
   supervisory confirmation — no automated recommendation to depart from") so the
   button label and the recorded outcome match. No change to the override branch.

## Verification

- A complaint with no automated recommendation: set harm/priority/risk/systemic →
  **Accept and confirm** succeeds, status shows **Confirmed**, one
  "Supervisory confirmation" entry appears in Triage history.
- A complaint that does have a recommendation: changing a dimension still shows the
  amber override box, still requires 10+ characters and override authority, and records
  **Confirmed with changes**.
- Selecting **Confirmed systemic** still demands justification and override authority.
- Officers without triage authority remain blocked.

## Technical notes

- One `CREATE OR REPLACE FUNCTION` migration for `public.complaint_triage_confirm`
  (SECURITY DEFINER, same signature, same grants) — no schema change, no data change.
- Materiality per dimension becomes: recommendation value present AND submitted value
  differs. Harm and priority stop falling back to the archived intake values for the
  override test, which is what currently produces the false positive.
