# Phase 8 — Market Surveillance: manual verification pack

Scope: MCS-SUR-001 (surveillance workspace and signal object), MCS-SUR-002
(escalation to formal investigation with provenance), MCS-SUR-003 (configurable
monitoring rules with immutable versions).

Automated coverage lives in `supabase/tests/phase8/`:

| File | Covers |
| --- | --- |
| `01_market_surveillance.sql` | Signal structure/provenance, six-state disposition vocabulary, RPC-only disposition changes, mandatory reasons, terminal states, append-only event ledger, evidence attachment |
| `02_referral.sql` | Referral gating (permission, state, allegation), investigation provenance (`surveillance_signal` + rule/version/threshold/window/source records), signal linkage and ESCALATED event |
| `03_rule_versions.sql` | Rule code/metric/threshold/operator/lookback, version bump on meaningful edits only, immutability of historical snapshots, client cannot rewrite history or reconfigure rules without permission |
| `04_rls_personas.sql` | 7-persona RLS matrix (applicant, licensee user, supervisor, analyst, admin, role-less internal user, anon), all negatives asserted by direct id |

Frontend unit coverage: `src/test/conductSurveillance.test.ts`.

---

## Personas used below

| Persona | Setup |
| --- | --- |
| Supervisor | internal user whose dynamic role has `market_conduct: view, run_conduct_analytics, manage_monitoring_rules, initiate_investigation` |
| Analyst | internal user with `market_conduct: view, run_conduct_analytics` only |
| Licensee user | external primary user of the entity a signal is about |
| Applicant | external applicant portal user |

---

## MV-8.1 Surveillance workspace lists signals with explanation

1. Sign in as **Supervisor**.
2. Navigate to **Conduct → Market Surveillance** (`/conduct/surveillance`).
3. Expected UI: disposition tabs (New, Under review, Monitoring, False positive,
   Escalated, Closed) with counts; severity / rule / entity filters; each row
   shows entity, rule, severity, observation window and the "why it fired" text.
4. Expected copy: the page states explicitly that a signal is not a confirmed
   misconduct finding.
5. Expected DB: no writes are produced by browsing.

## MV-8.2 Signal detail shows full provenance

1. As **Supervisor**, open any signal from the workspace.
2. Expected UI drawer sections: rule fired (with rule version), threshold
   crossed, observation period, cited source records, attached evidence, and the
   disposition history timeline.
3. Expected DB: `conduct_alerts.rule_version`, `threshold_value`,
   `observation_start/end`, `source_record_ids` populated for that row.

## MV-8.3 Disposition lifecycle

1. As **Supervisor**, on a `NEW` signal choose **Take under review**.
   - Expected UI: disposition badge becomes `UNDER_REVIEW`; a timeline entry
     appears with your name and timestamp.
   - Expected DB: `conduct_alerts.disposition='UNDER_REVIEW'`,
     `reviewed_by` = your user id, one new `conduct_signal_events` row
     (`NEW → UNDER_REVIEW`).
2. Choose **Mark false positive** and leave the reason blank.
   - Expected UI: blocked with a validation message; no state change.
3. Provide a reason and confirm.
   - Expected DB: `disposition='FALSE_POSITIVE'`, `disposition_reason` stored,
     legacy `status='closed'`, one further event row.
4. Try to change the disposition again on that closed signal.
   - Expected UI: action unavailable / refused ("cannot be re-dispositioned").

**Negative / security case:** with the browser devtools network tab, replay the
signal update as a direct table `PATCH` on `conduct_alerts` setting
`disposition`. Expected: rejected — "Signal disposition can only be changed via
set_conduct_signal_disposition()".

## MV-8.4 Evidence attachment

1. As **Supervisor**, in the signal drawer add an evidence item (label + note,
   optional document).
2. Expected UI: item appears in the evidence list with your name.
3. Expected DB: new `conduct_signal_evidence` row with `added_by` = your id.
4. Negative: as **Licensee user**, request the same signal's evidence by id.
   Expected: empty result (RLS), not a 403 leak of the row's existence.

## MV-8.5 Referral to formal investigation

1. As **Analyst**, open an `UNDER_REVIEW` signal.
   - Expected UI: **Refer to investigation** is hidden or disabled.
   - Negative: invoke the RPC directly. Expected: "Not authorized to refer
     signals to investigation".
2. As **Supervisor**, on the same signal click **Refer to investigation**,
   provide an allegation summary, priority and due date, and confirm.
   - Expected UI: success toast, navigation/link to the new investigation,
     signal badge becomes `ESCALATED`.
   - Expected DB: new `conduct_investigations` row with
     `source_type='surveillance_signal'`, `source_id` = signal id, entity and
     severity inherited, `metadata` containing `signal_rule_version`,
     `signal_threshold`, `signal_explanation`, `signal_source_record_ids`,
     `signal_observation_start/end`; `conduct_alerts.investigation_id` set; one
     `conduct_signal_events` row `UNDER_REVIEW → ESCALATED` carrying the
     investigation id.
3. Open the new investigation detail page.
   - Expected UI: "Originating signal" provenance block linking back to the
     signal, its rule and rule version.
4. Negative: attempt referral on a signal in `NEW` or `FALSE_POSITIVE`.
   Expected: refused ("Only a signal under review can be referred").

## MV-8.6 Monitoring rule configuration and versions

1. As **Supervisor** (has `manage_monitoring_rules`), go to
   **Admin → Conduct → Monitoring Rules**.
2. Create a rule with code, metric, source dataset, comparison operator,
   threshold and lookback days.
   - Expected DB: `current_version = 1` and one
     `conduct_monitoring_rule_versions` row with the full snapshot.
3. Edit only the description.
   - Expected UI: version history unchanged (still v1).
4. Change the threshold and save.
   - Expected UI: version history shows v2 with the new threshold, v1 still
     shows the old threshold.
   - Expected DB: `current_version = 2`; v1 snapshot unchanged.
5. Toggle the rule inactive.
   - Expected: v3 snapshot with `active: false`.
6. Negative: as **Analyst**, attempt to edit the rule. Expected: blocked in UI
   and refused by RLS if replayed directly.
7. Negative: replay a `PATCH`/`DELETE` against
   `conduct_monitoring_rule_versions`. Expected: refused (append-only).

## MV-8.7 Signal → rule version traceability

1. As **Supervisor**, note a signal's rule version in the drawer.
2. Open the rule's version history and select that version.
3. Expected: the threshold and lookback shown for that version match the values
   in the signal explanation, even if the live rule has since changed.

---

## Known limitations

- Signals are generated by the existing conduct triage/monitoring engine; this
  phase did not add a second alerting engine. Rules whose `definition` jsonb is
  hand-edited outside the admin screen still version correctly, but the UI form
  only exposes the first-class fields.
- The pgTAP files insert into `auth.users`, so they must be executed by the
  migration/CI database role, not by the restricted read-only role.
