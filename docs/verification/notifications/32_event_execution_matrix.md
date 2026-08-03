# Notification Event Execution Matrix

Generated: 2026-08-03T10:59:54.812Z
Generator: `scripts/notification-closure-report.mjs`

One row per configured event. "Wired" means a backend call site exists (database
function/trigger body or edge function); frontend references never count.
"Exercised" means at least one real delivery record exists for the event key.
Events with no delivery record are reported as NOT EXERCISED — never as passed.

| Result | Events |
| --- | --- |
| NOT EXERCISED | 156 |
| PARTIAL (legacy dispatch only) | 52 |
| PASS | 4 |
| OUT OF SCOPE (deactivated) | 2 |

## administration

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `escalation_rule.changed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `notification_template.published` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `rule.activated` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `rule.first_fired` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `user.role_changed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `workflow.published` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## application

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `application.ai_overridden` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.approved_step` | active | wired | 3 | y | 23 (16/7) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.cancelled` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.comment_saved` | active | wired | 2 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.final_approved` | active | wired | 4 | y | 62 (31/31) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.rejected` | active | wired | 3 | y | 8 (4/4) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.resubmission_requested` | active | wired | 2 | y | 2 (1/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.resubmitted.applicant` | active | wired | 1 | y | 2 (1/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.resubmitted.reviewer` | active | wired | 2 | y | 6 (3/3) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.rfi_near_due` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.rfi_overdue` | active | wired | 3 | y | 12 (6/6) | 12 | 12 (12) | PASS |
| `application.rfi_raised` | active | wired | 2 | y | 14 (7/7) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.rfi_responded` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.send_back` | active | wired | 3 | y | 20 (10/10) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.submitted` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.submitted.applicant` | active | wired | 1 | y | 48 (24/24) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.submitted.reviewer` | active | wired | 2 | y | 34 (17/17) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `application.workflow_action_taken` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## communications

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `correspondence.awaiting_response` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.external_message_sent` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.external_response_received` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.internal_message_posted` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.internal_participant_added` | active | wired | 1 | y | 0 (0/0) | 0 | 1 (1) | NOT EXERCISED |
| `correspondence.sla_breached` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.sla_near_breach` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## complaint

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `complaint.closed` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.escalated_to_enforcement` | active | wired | 5 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.investigation_started` | active | wired | 5 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.resolved` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## compliance

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compliance.return_due` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `compliance.return_rejected_or_changes_requested` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `compliance.return_reviewed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `compliance.return_submitted` | active | wired | 3 | y | 3 (3/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## conduct

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `complaint.acknowledged` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.complainant_update` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.investigation_overdue` | active | wired | 2 | y | 10 (5/5) | 10 | 10 (10) | PASS |
| `complaint.outcome_released` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.priority_changed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `complaint.rfi_raised` | deactivated | n/a | 2 | y | 0 (0/0) | 0 | 0 (0) | OUT OF SCOPE (deactivated) |
| `complaint.rfi_responded` | deactivated | n/a | 1 | y | 0 (0/0) | 0 | 0 (0) | OUT OF SCOPE (deactivated) |
| `conduct.pattern_alert` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `conduct.systemic_flag_raised` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_action_assigned

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_action_cancelled

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_cancelled` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_action_completed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_completed` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_action_created

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_created` | active | wired | 3 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## conduct_action_overdue

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_overdue` | active | wired | 2 | y | 12 (6/6) | 12 | 12 (0) | PASS |

## conduct_action_waived

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_waived` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_alert_acknowledged

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_acknowledged` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_alert_closed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_closed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_alert_created

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_created` | active | wired | 2 | y | 4 (2/2) | 0 | 4 (0) | PARTIAL (legacy dispatch only) |

## conduct_complaint_created

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_complaint_created` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_complaint_triaged

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_complaint_triaged` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_evidence_access_denied

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_evidence_access_denied` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_evidence_uploaded

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_evidence_uploaded` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_high_severity_complaint

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_high_severity_complaint` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_investigation_assigned

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_assigned` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_investigation_closed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_closed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_investigation_opened

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_opened` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_monitoring_rule_triggered

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_monitoring_rule_triggered` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_thematic_review_assigned

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_assigned` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_thematic_review_closed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_closed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## conduct_thematic_review_created

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_created` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## correspondence

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `correspondence.reply_received` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `correspondence.response_sent` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## enforcement

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `enforcement.case_closed` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `enforcement.case_withdrawn` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `enforcement.decision_recorded` | active | wired | 5 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `enforcement.notice_issued` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `enforcement.response_received` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## entity

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `entity.primary_user_created` | active | wired | 3 | y | 56 (28/28) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `entity.secondary_user_created` | active | wired | 3 | y | 6 (3/3) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `entity.user_access_revoked` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `entity.user_role_changed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fit_and_proper

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp.assessment_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.committee_decision` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.committee_ready` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.determination_dispatched` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.pq_invitation` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.pq_submitted` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `fp.screening_completed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## form_version

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `form_version.published` | active | wired | 1 | y | 24 (12/12) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `form_version.upcoming` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fp_appeal_decided

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_appeal_decided` | active | wired | 2 | y | 2 (2/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## fp_condition_overdue

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_condition_overdue` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fp_condition_reminder

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_condition_reminder` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fp_cycle_assessment_opened

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_cycle_assessment_opened` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fp_finding_assigned

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_finding_assigned` | active | wired | 1 | y | 2 (2/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## fp_finding_resolved

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_finding_resolved` | active | wired | 2 | y | 2 (2/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## fp_high_severity_finding

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_high_severity_finding` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## fp_monitoring_alert

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_monitoring_alert` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## license

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `license.cancelled` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.created` | active | wired | 4 | y | 28 (14/14) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `license.expired` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.expiring_soon` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.expiring_soon_officer` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.reinstated` | active | wired | 1 | y | 10 (5/5) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `license.renewal_approved` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.renewal_requested` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.renewed` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.revoked` | active | wired | 2 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `license.status_changed` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.suspended` | active | wired | 2 | y | 34 (17/17) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## license_appeal

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `license_appeal.acknowledged` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license_appeal.decided` | active | wired | 1 | y | 2 (1/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `license_appeal.filed` | active | wired | 1 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `license_appeal.panel_assigned` | active | wired | 1 | y | 2 (1/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## licensee

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `licensee.created` | active | wired | 3 | y | 16 (16/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## licensing

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `application.analyst_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.decision_dispatched` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.decision_ready` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.escalated_to_supervisor` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.legal_review_completed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.officer_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `application.routed_to_legal` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.certificate_issued` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `license.varied` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## notification

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `notification.admin_failure_alert` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## payment

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `payment.failed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `payment.received` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `payment.required` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential.early_warning_triggered` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `prudential.examination_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `prudential.examination_finding_recorded` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `prudential.examination_notice_issued` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `prudential.group_contagion_alert` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `prudential.remediation_due` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.rfi_raised` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `supervisory_plan.created` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_action_assigned

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_assigned` | active | wired | 1 | y | 6 (3/3) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## prudential_action_completed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_completed` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_action_overdue

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_overdue` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_assessment_approved

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_approved` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_assessment_reviewed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_reviewed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_assessment_submitted

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_submitted` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_breach_detected

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_breach_detected` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_escalation_created

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_escalation_created` | active | wired | 3 | y | 8 (4/4) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## prudential_escalation_resolved

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_escalation_resolved` | active | wired | 3 | y | 8 (4/4) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## prudential_return_validation_failed

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_return_validation_failed` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## prudential_stress_indicator_triggered

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_stress_indicator_triggered` | active | wired | 3 | y | 28 (14/14) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## registration

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `registration.action_taken` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.approved` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.approved_step` | active | wired | 4 | y | 48 (14/34) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.comment_saved` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.correction_required` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.escalated` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.final_approved` | active | wired | 1 | y | 20 (10/10) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.final_rejected` | active | wired | 1 | y | 2 (1/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.more_info_requested` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.new_submission` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.pending_review` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.received` | active | wired | 1 | y | 30 (15/15) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.rejected` | active | wired | 1 | y | 1 (0/1) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.resubmission_requested` | active | wired | 1 | y | 4 (1/3) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.resubmitted` | active | wired | 4 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.returned_for_correction` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.send_back` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.step_assigned` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.step_entered` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.submitted` | active | wired | 3 | y | 44 (22/22) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `registration.workflow_completed` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `registration.workflow_started` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## regulator

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `regulator.action_taken_on_application` | active | wired | 3 | y | 41 (41/0) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `regulator.assignment_changed` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `regulator.comment_added_or_query_raised` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## reporting

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ai.critical_insight` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `ai.insight_generated` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `ai.processing_failed` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `report.delivery_failed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `report.first_delivery_success` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `report.scheduled_delivered` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## return

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `return.analysis_complete` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.approved` | active | wired | 3 | y | 10 (5/5) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.approved_step` | active | wired | 2 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.breach_critical` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.breach_warning` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.comment_added` | active | wired | 4 | y | 8 (4/4) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.comment_saved` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.edit_requested` | active | wired | 3 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.overdue` | active | wired | 2 | y | 10 (5/5) | 4 | 10 (10) | PASS |
| `return.rejected` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.resubmission_requested` | active | wired | 2 | y | 4 (2/2) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.resubmitted` | active | wired | 3 | y | 14 (7/7) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.resubmitted.confirmation` | active | wired | 2 | y | 10 (5/5) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.send_back` | active | wired | 4 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.submitted` | active | wired | 3 | y | 16 (8/8) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.submitted.confirmation` | active | wired | 2 | y | 12 (6/6) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |
| `return.supervisor_escalation` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.validation_failed` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.validation_passed` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `return.workflow_action_taken` | active | wired | 2 | y | 16 (8/8) | 0 | 0 (0) | PARTIAL (legacy dispatch only) |

## sla

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sla.breach` | active | wired | 4 | y | 8 (4/4) | 0 | 8 (0) | PARTIAL (legacy dispatch only) |
| `sla.configuration_updated` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `sla.warning` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## system

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `escalation.created` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `escalation.ownership_assigned` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `escalation.resolved` | active | wired | 2 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `escalation.tier_advanced` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.cron_failure` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.dispatch_failure_repeated` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.integration_failure` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.notification_queue_backlog` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.scheduler_failure` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.sms_provider_failure` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |
| `system_health.smtp_failure_threshold` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## user

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `user.invited` | active | wired | 1 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

## workflow

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `workflow.sla_escalation` | active | wired | 3 | y | 0 (0/0) | 0 | 0 (0) | NOT EXERCISED |

Machine-readable copy: `32_event_execution_matrix.csv`.
