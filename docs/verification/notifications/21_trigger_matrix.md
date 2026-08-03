# Notification Trigger Matrix (authoritative)

Generated: 2026-08-03T10:19:54.025Z
Generator: `scripts/notification-trigger-scan.mjs`

"Wired" means a backend call site exists (database function/trigger body or edge
function). Frontend-only references never count as wiring.

| Measure | Value |
| --- | --- |
| Active events | 212 |
| Active events wired | 212 |
| Active events unwired | 0 |
| Active events executed at least once | 56 |
| Active events wired but not yet executed | 156 |
| Deactivated (out of approved scope) | 2 |

## administration

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `escalation_rule.changed` | active | wired | db:trg_escalation_rule_change_notification | 2 | y | y | y | n |
| `notification_template.published` | active | wired | db:trg_notification_template_published | 2 | y | n | y | n |
| `rule.activated` | active | wired | db:trg_escalation_rule_activated_notification,trg_monitoring_rule_activated_notification | 2 | y | y | y | n |
| `rule.first_fired` | active | wired | db:trg_monitoring_rule_first_fired_notification | 2 | y | y | y | n |
| `user.role_changed` | active | wired | db:trg_user_role_change_notification | 2 | y | y | y | n |
| `workflow.published` | active | wired | db:trg_workflow_published_notification | 2 | y | y | y | n |

## application

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `application.ai_overridden` | active | wired | db:trg_notify_application_ai_overridden | 2 | y | y | y | n |
| `application.approved_step` | active | wired | edge:perform-workflow-action/index.ts | 3 | y | n | y | y |
| `application.cancelled` | active | wired | db:tg_applications_audit | 3 | y | n | y | n |
| `application.comment_saved` | active | wired | edge:perform-workflow-action/index.ts | 2 | y | y | y | y |
| `application.final_approved` | active | wired | edge:perform-workflow-action/index.ts | 4 | y | y | y | y |
| `application.rejected` | active | wired | db:tg_applications_audit | 3 | y | y | y | y |
| `application.resubmission_requested` | active | wired | db:tg_applications_audit | 2 | y | y | y | y |
| `application.resubmitted.applicant` | active | wired | edge:verify-and-submit/index.ts | 1 | y | y | y | y |
| `application.resubmitted.reviewer` | active | wired | edge:verify-and-submit/index.ts | 2 | y | y | y | y |
| `application.rfi_near_due` | active | wired | db:notify_application_rfi_deadlines | 2 | y | y | y | n |
| `application.rfi_overdue` | active | wired | db:notify_application_rfi_deadlines | 3 | y | y | y | y |
| `application.rfi_raised` | active | wired | db:trg_notify_application_rfi_raised | 2 | y | y | y | y |
| `application.rfi_responded` | active | wired | db:trg_notify_application_rfi_responded | 2 | y | n | y | n |
| `application.send_back` | active | wired | edge:perform-workflow-action/index.ts | 3 | y | y | y | y |
| `application.submitted` | active | wired | db:tg_applications_audit | 3 | y | y | y | n |
| `application.submitted.applicant` | active | wired | edge:verify-and-submit/index.ts | 1 | y | y | y | y |
| `application.submitted.reviewer` | active | wired | edge:verify-and-submit/index.ts | 2 | y | y | y | y |
| `application.workflow_action_taken` | active | wired | edge:perform-workflow-action/index.ts | 3 | y | n | y | n |

## communications

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `correspondence.awaiting_response` | active | wired | db:trg_correspondence_awaiting_response_notification | 2 | y | y | y | n |
| `correspondence.external_message_sent` | active | wired | db:post_correspondence_message | 2 | y | y | y | n |
| `correspondence.external_response_received` | active | wired | db:post_correspondence_message | 3 | y | y | y | n |
| `correspondence.internal_message_posted` | active | wired | db:post_correspondence_message,trg_notify_correspondence_message | 3 | y | y | y | n |
| `correspondence.internal_participant_added` | active | wired | db:correspondence_add_participant | 1 | y | y | y | n |
| `correspondence.sla_breached` | active | wired | db:correspondence_sla_sweep | 3 | y | y | y | n |
| `correspondence.sla_near_breach` | active | wired | db:correspondence_sla_sweep | 1 | y | y | y | n |

## complaint

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `complaint.closed` | active | wired | db:close_complaint,get_public_complaint_tracking_raw | 4 | y | y | y | n |
| `complaint.escalated_to_enforcement` | active | wired | db:escalate_complaint_to_enforcement,get_public_complaint_tracking_raw | 5 | y | y | y | n |
| `complaint.investigation_started` | active | wired | db:get_public_complaint_tracking_raw,start_complaint_investigation | 5 | y | y | y | n |
| `complaint.resolved` | active | wired | db:get_public_complaint_tracking_raw,resolve_complaint | 4 | y | y | y | n |

## compliance

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compliance.return_due` | active | wired | db:notify_returns_due | 2 | y | y | y | n |
| `compliance.return_rejected_or_changes_requested` | active | wired | db:trg_return_notification_events | 2 | y | y | y | n |
| `compliance.return_reviewed` | active | wired | db:trg_return_notification_events | 2 | y | y | y | n |
| `compliance.return_submitted` | active | wired | db:trg_return_notification_events | 3 | y | n | y | y |

## conduct

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `complaint.acknowledged` | active | wired | db:trg_complaint_notifications | 2 | y | y | y | n |
| `complaint.assigned` | active | wired | db:assign_complaint,start_complaint_workflow,trg_complaint_notifications | 1 | y | y | y | n |
| `complaint.complainant_update` | active | wired | db:trg_complaint_correspondence_notification | 2 | y | y | y | n |
| `complaint.investigation_overdue` | active | wired | db:notify_overdue_complaint_investigations | 2 | y | y | y | y |
| `complaint.outcome_released` | active | wired | db:trg_complaint_notifications | 2 | y | y | y | n |
| `complaint.priority_changed` | active | wired | db:trg_complaint_notifications | 2 | y | y | y | n |
| `complaint.rfi_raised` | deactivated | n/a | none | 2 | y | y | y | n |
| `complaint.rfi_responded` | deactivated | n/a | none | 1 | y | y | y | n |
| `conduct.pattern_alert` | active | wired | db:trg_conduct_pattern_notification | 2 | y | y | y | n |
| `conduct.systemic_flag_raised` | active | wired | db:trg_conduct_pattern_notification | 2 | y | y | y | n |

## conduct_action_assigned

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_assigned` | active | wired | db:trg_conduct_action_assigned_notification | 1 | y | y | y | n |

## conduct_action_cancelled

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_cancelled` | active | wired | db:trg_notify_conduct_action | 3 | y | y | y | n |

## conduct_action_completed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_completed` | active | wired | db:trg_notify_conduct_action | 3 | y | y | y | n |

## conduct_action_created

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_created` | active | wired | db:trg_notify_conduct_action | 3 | y | y | y | y |

## conduct_action_overdue

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_overdue` | active | wired | db:notify_overdue_conduct_actions | 2 | y | y | y | y |

## conduct_action_waived

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_action_waived` | active | wired | db:trg_notify_conduct_action | 4 | y | y | y | n |

## conduct_alert_acknowledged

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_acknowledged` | active | wired | db:trg_notify_conduct_alert | 2 | y | n | y | n |

## conduct_alert_closed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_closed` | active | wired | db:trg_notify_conduct_alert | 2 | y | n | y | n |

## conduct_alert_created

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_alert_created` | active | wired | db:trg_conduct_alert_created_notification | 2 | y | y | y | y |

## conduct_complaint_created

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_complaint_created` | active | wired | db:trg_conduct_complaint_notification_events | 2 | y | y | y | n |

## conduct_complaint_triaged

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_complaint_triaged` | active | wired | db:trg_conduct_complaint_notification_events | 2 | y | n | y | n |

## conduct_evidence_access_denied

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_evidence_access_denied` | active | wired | db:trg_notify_conduct_evidence_denied | 2 | y | n | y | n |

## conduct_evidence_uploaded

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_evidence_uploaded` | active | wired | db:trg_notify_conduct_evidence_uploaded | 2 | y | n | y | n |

## conduct_high_severity_complaint

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_high_severity_complaint` | active | wired | db:trg_conduct_complaint_notification_events | 3 | y | y | y | n |

## conduct_investigation_assigned

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_assigned` | active | wired | db:trg_notify_conduct_investigation | 2 | y | y | y | n |

## conduct_investigation_closed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_closed` | active | wired | db:trg_notify_conduct_investigation | 2 | y | n | y | n |

## conduct_investigation_opened

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_investigation_opened` | active | wired | db:trg_notify_conduct_investigation | 2 | y | y | y | n |

## conduct_monitoring_rule_triggered

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_monitoring_rule_triggered` | active | wired | edge:evaluate-conduct-monitoring/index.ts | 2 | y | y | y | n |

## conduct_thematic_review_assigned

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_assigned` | active | wired | db:trg_thematic_review_notification_events | 2 | y | y | y | n |

## conduct_thematic_review_closed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_closed` | active | wired | db:trg_thematic_review_notification_events | 2 | y | n | y | n |

## conduct_thematic_review_created

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_thematic_review_created` | active | wired | db:trg_thematic_review_notification_events | 2 | y | n | y | n |

## correspondence

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `correspondence.reply_received` | active | wired | db:trg_notify_correspondence_message | 1 | y | y | y | n |
| `correspondence.response_sent` | active | wired | db:trg_notify_correspondence_message | 1 | y | y | y | n |

## enforcement

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `enforcement.case_closed` | active | wired | db:trg_enforcement_notification_events | 4 | y | y | y | n |
| `enforcement.case_withdrawn` | active | wired | db:trg_enforcement_notification_events | 4 | y | y | y | n |
| `enforcement.decision_recorded` | active | wired | db:trg_enforcement_notification_events | 5 | y | y | y | n |
| `enforcement.notice_issued` | active | wired | db:trg_enforcement_notification_events | 4 | y | y | y | n |
| `enforcement.response_received` | active | wired | db:trg_enforcement_notification_events | 2 | y | y | y | n |

## entity

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `entity.primary_user_created` | active | wired | edge:create-web-user/index.ts | 3 | y | y | y | y |
| `entity.secondary_user_created` | active | wired | edge:create-web-user/index.ts | 3 | y | y | y | y |
| `entity.user_access_revoked` | active | wired | db:trg_entity_user_access_notification | 3 | y | y | y | n |
| `entity.user_role_changed` | active | wired | db:trg_entity_user_access_notification | 2 | y | n | y | n |

## fit_and_proper

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp.assessment_assigned` | active | wired | db:trg_fp_manual_task_notification | 1 | y | y | y | n |
| `fp.committee_decision` | active | wired | db:trg_fp_assessment_committee_notification | 2 | y | y | y | n |
| `fp.committee_ready` | active | wired | db:trg_fp_assessment_committee_notification | 2 | y | y | y | n |
| `fp.determination_dispatched` | active | wired | db:trg_fp_determination_notification | 3 | y | y | y | n |
| `fp.pq_invitation` | active | wired | db:trg_fp_invitation_notification | 3 | y | y | y | n |
| `fp.pq_submitted` | active | wired | db:trg_fp_invitation_notification | 2 | y | y | y | n |
| `fp.screening_completed` | active | wired | db:trg_fp_screening_run_notification | 2 | y | y | y | n |

## form_version

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `form_version.published` | active | wired | db:trg_notify_form_version_published | 1 | y | y | y | y |
| `form_version.upcoming` | active | wired | db:notify_upcoming_form_versions | 1 | y | y | y | n |

## fp_appeal_decided

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_appeal_decided` | active | wired | db:trg_notify_fp_appeal_decided | 2 | y | n | y | y |

## fp_condition_overdue

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_condition_overdue` | active | wired | edge:fp-monitoring-sweep/index.ts | 2 | y | n | y | n |

## fp_condition_reminder

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_condition_reminder` | active | wired | edge:fp-monitoring-sweep/index.ts | 2 | y | n | y | n |

## fp_cycle_assessment_opened

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_cycle_assessment_opened` | active | wired | edge:fp-cycle-scheduler/index.ts | 1 | y | n | y | n |

## fp_finding_assigned

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_finding_assigned` | active | wired | db:trg_notify_fp_finding | 1 | y | n | y | y |

## fp_finding_resolved

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_finding_resolved` | active | wired | db:trg_notify_fp_finding | 2 | y | n | y | y |

## fp_high_severity_finding

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_high_severity_finding` | active | wired | edge:fp-screening-run/index.ts | 1 | y | n | y | n |

## fp_monitoring_alert

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fp_monitoring_alert` | active | wired | edge:fp-monitoring-sweep/index.ts | 1 | y | n | y | n |

## license

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `license.cancelled` | active | wired | edge:perform-license-action/index.ts | 2 | y | y | y | n |
| `license.created` | active | wired | edge:perform-workflow-action/index.ts | 4 | y | y | y | y |
| `license.expired` | active | wired | edge:license-expiry-reminders/index.ts | 2 | y | y | y | n |
| `license.expiring_soon` | active | wired | edge:license-expiry-reminders/index.ts | 1 | y | y | y | n |
| `license.expiring_soon_officer` | active | wired | edge:license-expiry-reminders/index.ts | 2 | y | y | y | n |
| `license.reinstated` | active | wired | edge:perform-license-action/index.ts | 1 | y | y | y | y |
| `license.renewal_approved` | active | wired | db:trg_notify_license_renewal | 2 | y | y | y | n |
| `license.renewal_requested` | active | wired | db:trg_notify_license_renewal | 3 | y | y | y | n |
| `license.renewed` | active | wired | edge:perform-workflow-action/index.ts | 1 | y | y | y | n |
| `license.revoked` | active | wired | edge:perform-license-action/index.ts | 2 | y | y | y | y |
| `license.status_changed` | active | wired | edge:perform-license-action/index.ts | 4 | y | y | y | n |
| `license.suspended` | active | wired | edge:perform-license-action/index.ts | 2 | y | y | y | y |

## license_appeal

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `license_appeal.acknowledged` | active | wired | db:trg_notify_license_appeal | 1 | y | y | y | n |
| `license_appeal.decided` | active | wired | db:trg_notify_license_appeal | 1 | y | y | y | y |
| `license_appeal.filed` | active | wired | db:trg_notify_license_appeal | 1 | y | y | y | y |
| `license_appeal.panel_assigned` | active | wired | db:trg_notify_license_appeal | 1 | y | y | y | y |

## licensee

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `licensee.created` | active | wired | edge:perform-workflow-action/index.ts | 3 | y | n | y | y |

## licensing

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `application.analyst_assigned` | active | wired | db:trg_application_notification_events | 1 | y | y | y | n |
| `application.decision_dispatched` | active | wired | db:trg_application_notification_events | 1 | y | y | y | n |
| `application.decision_ready` | active | wired | db:trg_application_notification_events | 2 | y | y | y | n |
| `application.escalated_to_supervisor` | active | wired | db:trg_approval_action_escalation_notification | 1 | y | y | y | n |
| `application.legal_review_completed` | active | wired | db:trg_application_notification_events | 2 | y | y | y | n |
| `application.officer_assigned` | active | wired | db:trg_application_notification_events | 1 | y | y | y | n |
| `application.routed_to_legal` | active | wired | db:trg_application_notification_events | 1 | y | y | y | n |
| `license.certificate_issued` | active | wired | db:trg_license_certificate_notification | 2 | y | y | y | n |
| `license.varied` | active | wired | db:trg_license_varied_notification | 1 | y | y | y | n |

## notification

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `notification.admin_failure_alert` | active | wired | edge:notification-failure-sweep/index.ts | 2 | y | y | y | n |

## payment

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `payment.failed` | active | wired | db:tg_payments_audit | 2 | y | y | y | n |
| `payment.received` | active | wired | db:trg_notify_payment | 3 | y | y | y | n |
| `payment.required` | active | wired | db:trg_notify_payment | 2 | y | y | y | n |

## prudential

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential.early_warning_triggered` | active | wired | db:trg_return_threshold_breach_notification | 2 | y | y | y | n |
| `prudential.examination_assigned` | active | wired | db:trg_examination_notifications | 1 | y | y | y | n |
| `prudential.examination_finding_recorded` | active | wired | db:trg_examination_finding_notification | 2 | y | y | y | n |
| `prudential.examination_notice_issued` | active | wired | db:trg_examination_notifications | 2 | y | y | y | n |
| `prudential.group_contagion_alert` | active | wired | db:trg_return_threshold_breach_notification | 2 | y | y | y | n |
| `prudential.remediation_due` | active | wired | db:notify_prudential_remediation_due | 2 | y | y | y | n |
| `return.rfi_raised` | active | wired | db:trg_return_request_notification | 2 | y | y | y | n |
| `supervisory_plan.created` | active | wired | db:trg_supervisory_plan_created_notification | 2 | y | y | y | n |

## prudential_action_assigned

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_assigned` | active | wired | db:trg_notify_prudential_action | 1 | y | y | y | y |

## prudential_action_completed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_completed` | active | wired | db:trg_notify_prudential_action | 1 | y | n | y | n |

## prudential_action_overdue

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_action_overdue` | active | wired | db:notify_overdue_prudential_actions | 2 | y | y | y | n |

## prudential_assessment_approved

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_approved` | active | wired | db:trg_notify_prudential_assessment | 2 | y | y | y | n |

## prudential_assessment_reviewed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_reviewed` | active | wired | db:trg_notify_prudential_assessment | 2 | y | y | y | n |

## prudential_assessment_submitted

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_assessment_submitted` | active | wired | db:trg_notify_prudential_assessment | 2 | y | y | y | n |

## prudential_breach_detected

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_breach_detected` | active | wired | db:trg_return_threshold_breach_notification | 3 | y | y | y | n |

## prudential_escalation_created

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_escalation_created` | active | wired | edge:evaluate-return-prudential/index.ts | 3 | y | y | y | y |

## prudential_escalation_resolved

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_escalation_resolved` | active | wired | db:trg_notify_prudential_escalation_resolved | 3 | y | y | y | y |

## prudential_return_validation_failed

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_return_validation_failed` | active | wired | db:trg_return_validation_failure_notification | 3 | y | y | y | n |

## prudential_stress_indicator_triggered

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prudential_stress_indicator_triggered` | active | wired | edge:evaluate-return-prudential/index.ts | 3 | y | y | y | y |

## registration

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `registration.action_taken` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | n | y | n |
| `registration.approved` | active | wired | db:trg_registration_approved_notification | 1 | y | y | y | n |
| `registration.approved_step` | active | wired | edge:perform-registration-workflow-action/index.ts | 4 | y | y | y | y |
| `registration.comment_saved` | active | wired | edge:perform-registration-workflow-action/index.ts | 2 | y | y | y | n |
| `registration.correction_required` | active | wired | db:trg_notify_registration_state | 1 | y | y | y | n |
| `registration.escalated` | active | wired | edge:perform-registration-workflow-action/index.ts | 4 | y | y | y | n |
| `registration.final_approved` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | y |
| `registration.final_rejected` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | y |
| `registration.more_info_requested` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | n |
| `registration.new_submission` | active | wired | db:trg_notify_registration_state | 4 | y | y | y | n |
| `registration.pending_review` | active | wired | db:trg_notify_registration_state | 4 | y | y | y | n |
| `registration.received` | active | wired | edge:register-pre-licensee/index.ts | 1 | y | y | y | y |
| `registration.rejected` | active | wired | db:trg_notify_registration_state | 1 | y | y | y | y |
| `registration.resubmission_requested` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | y |
| `registration.resubmitted` | active | wired | db:trg_notify_registration_state | 4 | y | y | y | y |
| `registration.returned_for_correction` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | n |
| `registration.send_back` | active | wired | edge:perform-registration-workflow-action/index.ts | 1 | y | y | y | n |
| `registration.step_assigned` | active | wired | db:trg_notify_registration_step | 4 | y | y | y | n |
| `registration.step_entered` | active | wired | db:trg_notify_registration_step | 4 | y | y | y | n |
| `registration.submitted` | active | wired | edge:register-pre-licensee/index.ts | 3 | y | y | y | y |
| `registration.workflow_completed` | active | wired | db:trg_notify_registration_state | 1 | y | y | y | n |
| `registration.workflow_started` | active | wired | db:trg_notify_registration_state | 4 | y | y | y | n |

## regulator

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `regulator.action_taken_on_application` | active | wired | edge:perform-workflow-action/index.ts | 3 | y | n | y | y |
| `regulator.assignment_changed` | active | wired | db:trg_licensee_regulator_assignment_notification | 3 | y | n | y | n |
| `regulator.comment_added_or_query_raised` | active | wired | db:trg_return_comment_notification | 2 | y | y | y | n |

## reporting

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ai.critical_insight` | active | wired | edge:generate-dashboard-insights/index.ts | 2 | y | y | y | n |
| `ai.insight_generated` | active | wired | edge:generate-dashboard-insights/index.ts | 2 | y | n | y | n |
| `ai.processing_failed` | active | wired | edge:generate-dashboard-insights/index.ts,notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `report.delivery_failed` | active | wired | edge:run-scheduled-reports/index.ts | 2 | y | y | y | n |
| `report.first_delivery_success` | active | wired | edge:run-scheduled-reports/index.ts | 1 | y | y | y | n |
| `report.scheduled_delivered` | active | wired | edge:run-scheduled-reports/index.ts | 2 | y | y | y | n |

## return

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `return.analysis_complete` | active | wired | edge:generate-return-analysis/index.ts | 1 | y | y | y | n |
| `return.approved` | active | wired | db:perform_return_workflow_transition | 3 | y | y | y | y |
| `return.approved_step` | active | wired | edge:_shared/return-notification-payload.ts,perform-return-workflow-action/index.ts | 2 | y | y | y | y |
| `return.breach_critical` | active | wired | edge:evaluate-return-prudential/index.ts | 3 | y | y | y | n |
| `return.breach_warning` | active | wired | edge:evaluate-return-prudential/index.ts | 2 | y | y | y | n |
| `return.comment_added` | active | wired | db:tg_return_comment_added_audit | 4 | y | y | y | y |
| `return.comment_saved` | active | wired | db:perform_return_workflow_transition | 2 | y | y | y | n |
| `return.edit_requested` | active | wired | db:perform_return_workflow_transition | 3 | y | y | y | y |
| `return.overdue` | active | wired | edge:overdue-returns-sweep/index.ts | 2 | y | y | y | y |
| `return.rejected` | active | wired | db:perform_return_workflow_transition | 3 | y | y | y | n |
| `return.resubmission_requested` | active | wired | edge:perform-return-workflow-action/index.ts | 2 | y | y | y | y |
| `return.resubmitted` | active | wired | db:resubmit_return | 3 | y | y | y | y |
| `return.resubmitted.confirmation` | active | wired | edge:_shared/return-notification-payload.ts,resubmit-return/index.ts | 2 | y | y | y | y |
| `return.send_back` | active | wired | db:perform_return_workflow_transition | 4 | y | y | y | n |
| `return.submitted` | active | wired | edge:_shared/return-notification-payload.ts | 3 | y | y | y | y |
| `return.submitted.confirmation` | active | wired | edge:_shared/return-notification-payload.ts | 2 | y | y | y | y |
| `return.supervisor_escalation` | active | wired | edge:generate-return-analysis/index.ts | 2 | y | y | y | n |
| `return.validation_failed` | active | wired | edge:evaluate-return-prudential/index.ts | 2 | y | y | y | n |
| `return.validation_passed` | active | wired | edge:evaluate-return-prudential/index.ts | 1 | y | n | y | n |
| `return.workflow_action_taken` | active | wired | edge:perform-return-workflow-action/index.ts | 2 | y | y | y | y |

## sla

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sla.breach` | active | wired | db:notify_workflow_sla_events | 4 | y | y | y | y |
| `sla.configuration_updated` | active | wired | db:trg_notify_sla_configuration_updated,trg_notify_sla_escalation_tier_updated | 1 | y | y | y | n |
| `sla.warning` | active | wired | db:notify_workflow_sla_events | 3 | y | y | y | n |

## system

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `escalation.created` | active | wired | db:trg_escalation_notifications | 2 | y | y | y | n |
| `escalation.ownership_assigned` | active | wired | db:trg_escalation_notifications | 1 | y | y | y | n |
| `escalation.resolved` | active | wired | db:escalation_resolve,trg_escalation_notifications | 2 | y | y | y | n |
| `escalation.tier_advanced` | active | wired | db:escalation_advance_tier,trg_escalation_notifications | 3 | y | y | y | n |
| `system_health.cron_failure` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `system_health.dispatch_failure_repeated` | active | wired | edge:notification-event-queue-worker/index.ts,notification-email-retry-worker/index.ts | 1 | y | y | y | n |
| `system_health.integration_failure` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `system_health.notification_queue_backlog` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `system_health.scheduler_failure` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `system_health.sms_provider_failure` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |
| `system_health.smtp_failure_threshold` | active | wired | edge:notification-system-health-monitor/index.ts | 1 | y | y | y | n |

## user

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `user.invited` | active | wired | db:trg_notify_user_invited | 1 | y | y | y | n |

## workflow

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `workflow.sla_escalation` | active | wired | edge:sla-escalation-sweep/index.ts | 3 | y | y | y | n |

Machine-readable copy: `21_trigger_matrix.csv`.
