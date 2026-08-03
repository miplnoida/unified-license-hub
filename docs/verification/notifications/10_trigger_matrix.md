# Notifications — Authoritative Trigger Matrix

Generated from the live dev database. Total configured events: 214 (active: 212). Unwired active events: 0.

Every active event is emitted from a database trigger, a scheduled sweep function, or an
application/edge-function call site. All emissions go through `notification_enqueue_event`
(durable queue) and are dispatched by `notification-event-queue-worker`.

| Event key | State | Emitted from |
| --- | --- | --- |
| `ai.critical_insight` | active | Code: `index.ts` |
| `ai.insight_generated` | active | Code: `index.ts` |
| `ai.processing_failed` | active | Code: `index.ts` |
| `application.ai_overridden` | active | Code: `ApplicationAiAssessmentPanel.tsx` |
| `application.analyst_assigned` | active | DB: `trg_application_notification_events` |
| `application.approved_step` | active | Code: `ActionNotificationsEditor.tsx, actionNotificationsEditor.test.tsx, actionNotificationsPersistence.test.ts` |
| `application.cancelled` | active | DB: `tg_applications_audit`; Code: `auditLabels.ts` |
| `application.comment_saved` | active | Code: `index.ts, useActionNotifications.ts` |
| `application.decision_dispatched` | active | DB: `trg_application_notification_events` |
| `application.decision_ready` | active | DB: `trg_application_notification_events` |
| `application.escalated_to_supervisor` | active | DB: `trg_approval_action_escalation_notification` |
| `application.final_approved` | active | Code: `index.ts` |
| `application.legal_review_completed` | active | DB: `trg_application_notification_events` |
| `application.officer_assigned` | active | DB: `trg_application_notification_events` |
| `application.rejected` | active | DB: `tg_applications_audit`; Code: `ActionNotificationsEditor.tsx, actionNotificationsEditor.test.tsx, actionNotificationsEditorCrud.test.tsx` |
| `application.resubmission_requested` | active | DB: `tg_applications_audit`; Code: `ActionNotificationsEditor.tsx, actionNotificationsEditor.test.tsx, auditLabels.ts` |
| `application.resubmitted.applicant` | active | Code: `index.ts` |
| `application.resubmitted.reviewer` | active | Code: `index.ts` |
| `application.rfi_near_due` | active | Code: `index.ts` |
| `application.rfi_overdue` | active | Code: `index.ts` |
| `application.rfi_raised` | active | Code: `RaiseRfiDialog.tsx` |
| `application.rfi_responded` | active | Code: `ApplicationRfiTab.tsx` |
| `application.routed_to_legal` | active | DB: `trg_application_notification_events` |
| `application.send_back` | active | Code: `ActionNotificationsEditor.tsx, actionNotificationsEditor.test.tsx, index.ts` |
| `application.submitted` | active | DB: `tg_applications_audit`; Code: `auditLabels.ts, humanizeAudit.ts` |
| `application.submitted.applicant` | active | Code: `index.ts` |
| `application.submitted.reviewer` | active | Code: `index.ts` |
| `application.workflow_action_taken` | active | Code: `ActionNotificationsEditor.tsx, actionNotificationsEditorCrud.test.tsx, index.ts` |
| `complaint.acknowledged` | active | DB: `trg_complaint_notifications` |
| `complaint.assigned` | active | DB: `assign_complaint, start_complaint_workflow, trg_complaint_notifications` |
| `complaint.closed` | active | DB: `close_complaint, get_public_complaint_tracking_raw` |
| `complaint.complainant_update` | active | DB: `trg_complaint_correspondence_notification` |
| `complaint.escalated_to_enforcement` | active | DB: `escalate_complaint_to_enforcement, get_public_complaint_tracking_raw` |
| `complaint.investigation_overdue` | active | DB: `notify_overdue_complaint_investigations` |
| `complaint.investigation_started` | active | DB: `get_public_complaint_tracking_raw, start_complaint_investigation` |
| `complaint.outcome_released` | active | DB: `trg_complaint_notifications` |
| `complaint.priority_changed` | active | DB: `trg_complaint_notifications` |
| `complaint.resolved` | active | DB: `get_public_complaint_tracking_raw, resolve_complaint` |
| `complaint.rfi_raised` | inactive | — |
| `complaint.rfi_responded` | inactive | — |
| `compliance.return_due` | active | DB: `notify_returns_due` |
| `compliance.return_rejected_or_changes_requested` | active | DB: `trg_return_notification_events` |
| `compliance.return_reviewed` | active | DB: `trg_return_notification_events` |
| `compliance.return_submitted` | active | DB: `trg_return_notification_events` |
| `conduct_action_assigned` | active | DB: `trg_conduct_action_assigned_notification` |
| `conduct_action_cancelled` | active | Code: `useMarketConduct.ts` |
| `conduct_action_completed` | active | Code: `useMarketConduct.ts` |
| `conduct_action_created` | active | Code: `IssueActionDialog.tsx` |
| `conduct_action_overdue` | active | DB: `notify_overdue_conduct_actions` |
| `conduct_action_waived` | active | Code: `useMarketConduct.ts` |
| `conduct_alert_acknowledged` | active | Code: `ConductAlerts.tsx, useMarketConduct.ts` |
| `conduct_alert_closed` | active | Code: `ConductAlerts.tsx, useMarketConduct.ts` |
| `conduct_alert_created` | active | DB: `trg_conduct_alert_created_notification` |
| `conduct_complaint_created` | active | DB: `trg_conduct_complaint_notification_events` |
| `conduct_complaint_triaged` | active | DB: `trg_conduct_complaint_notification_events` |
| `conduct_evidence_access_denied` | active | Code: `useMarketConduct.ts` |
| `conduct_evidence_uploaded` | active | Code: `useMarketConduct.ts` |
| `conduct_high_severity_complaint` | active | DB: `trg_conduct_complaint_notification_events` |
| `conduct_investigation_assigned` | active | Code: `useMarketConduct.ts` |
| `conduct_investigation_closed` | active | Code: `useMarketConduct.ts` |
| `conduct_investigation_opened` | active | Code: `useMarketConduct.ts` |
| `conduct_monitoring_rule_triggered` | active | Code: `index.ts` |
| `conduct_thematic_review_assigned` | active | DB: `trg_thematic_review_notification_events` |
| `conduct_thematic_review_closed` | active | DB: `trg_thematic_review_notification_events` |
| `conduct_thematic_review_created` | active | DB: `trg_thematic_review_notification_events` |
| `conduct.pattern_alert` | active | DB: `trg_conduct_pattern_notification` |
| `conduct.systemic_flag_raised` | active | DB: `trg_conduct_pattern_notification` |
| `correspondence.awaiting_response` | active | DB: `trg_correspondence_awaiting_response_notification` |
| `correspondence.external_message_sent` | active | DB: `post_correspondence_message` |
| `correspondence.external_response_received` | active | DB: `post_correspondence_message` |
| `correspondence.internal_message_posted` | active | DB: `post_correspondence_message` |
| `correspondence.internal_participant_added` | active | DB: `correspondence_add_participant` |
| `correspondence.reply_received` | active | Code: `MyCorrespondenceDetail.tsx` |
| `correspondence.response_sent` | active | Code: `ResponseComposer.tsx` |
| `correspondence.sla_breached` | active | DB: `correspondence_sla_sweep` |
| `correspondence.sla_near_breach` | active | DB: `correspondence_sla_sweep` |
| `enforcement.case_closed` | active | DB: `trg_enforcement_notification_events` |
| `enforcement.case_withdrawn` | active | DB: `trg_enforcement_notification_events` |
| `enforcement.decision_recorded` | active | DB: `trg_enforcement_notification_events` |
| `enforcement.notice_issued` | active | DB: `trg_enforcement_notification_events` |
| `enforcement.response_received` | active | DB: `trg_enforcement_notification_events` |
| `entity.primary_user_created` | active | Code: `index.ts` |
| `entity.secondary_user_created` | active | Code: `index.ts` |
| `entity.user_access_revoked` | active | DB: `trg_entity_user_access_notification` |
| `entity.user_role_changed` | active | DB: `trg_entity_user_access_notification` |
| `escalation_rule.changed` | active | DB: `trg_escalation_rule_change_notification` |
| `escalation.created` | active | DB: `trg_escalation_notifications` |
| `escalation.ownership_assigned` | active | DB: `trg_escalation_notifications` |
| `escalation.resolved` | active | DB: `escalation_resolve, trg_escalation_notifications` |
| `escalation.tier_advanced` | active | DB: `escalation_advance_tier, trg_escalation_notifications` |
| `form_version.published` | active | Code: `useFormTemplates.ts` |
| `form_version.upcoming` | active | Code: `useFormTemplates.ts` |
| `fp_appeal_decided` | active | Code: `FpAppealsPanel.tsx, FpaAppeals.tsx` |
| `fp_condition_overdue` | active | Code: `index.ts` |
| `fp_condition_reminder` | active | Code: `FpaConditions.tsx, index.ts` |
| `fp_cycle_assessment_opened` | active | Code: `index.ts` |
| `fp_finding_assigned` | active | Code: `FpaManualTaskDetail.tsx, FpaManualTasks.tsx` |
| `fp_finding_resolved` | active | Code: `FpaManualTaskDetail.tsx` |
| `fp_high_severity_finding` | active | Code: `FpaFindings.tsx, index.ts` |
| `fp_monitoring_alert` | active | Code: `index.ts` |
| `fp.assessment_assigned` | active | DB: `trg_fp_manual_task_notification` |
| `fp.committee_decision` | active | DB: `trg_fp_assessment_committee_notification` |
| `fp.committee_ready` | active | DB: `trg_fp_assessment_committee_notification` |
| `fp.determination_dispatched` | active | DB: `trg_fp_determination_notification` |
| `fp.pq_invitation` | active | DB: `trg_fp_invitation_notification` |
| `fp.pq_submitted` | active | DB: `trg_fp_invitation_notification` |
| `fp.screening_completed` | active | DB: `trg_fp_screening_run_notification` |
| `license_appeal.acknowledged` | active | Code: `useLicenseAppeals.ts` |
| `license_appeal.decided` | active | Code: `useLicenseAppeals.ts` |
| `license_appeal.filed` | active | Code: `useLicenseAppeals.ts` |
| `license_appeal.panel_assigned` | active | Code: `useLicenseAppeals.ts` |
| `license.cancelled` | active | Code: `index.ts, notificationEvents.ts` |
| `license.certificate_issued` | active | DB: `trg_license_certificate_notification` |
| `license.created` | active | Code: `index.ts, notificationEvents.ts` |
| `license.expired` | active | Code: `index.ts, notificationEvents.ts` |
| `license.expiring_soon` | active | Code: `index.ts, notificationEvents.ts` |
| `license.expiring_soon_officer` | active | Code: `index.ts, notificationEvents.ts` |
| `license.reinstated` | active | Code: `index.ts, notificationEvents.ts` |
| `license.renewal_approved` | active | Code: `notificationEvents.ts` |
| `license.renewal_requested` | active | Code: `notificationEvents.ts` |
| `license.renewed` | active | Code: `index.ts, notificationEvents.ts` |
| `license.revoked` | active | Code: `index.ts, notificationEvents.ts` |
| `license.status_changed` | active | Code: `index.ts, notificationEvents.ts` |
| `license.suspended` | active | Code: `index.ts, notificationEvents.ts` |
| `license.varied` | active | DB: `trg_license_varied_notification` |
| `licensee.created` | active | Code: `index.ts` |
| `notification_template.published` | active | DB: `trg_notification_template_published` |
| `notification.admin_failure_alert` | active | Code: `index.ts` |
| `payment.failed` | active | DB: `tg_payments_audit`; Code: `LicenseePaymentPanel.tsx, NewApplication.tsx, auditLabels.ts` |
| `payment.received` | active | Code: `PaymentVerificationDialog.tsx, notificationEvents.ts` |
| `payment.required` | active | Code: `notificationEvents.ts` |
| `prudential_action_assigned` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_action_completed` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_action_overdue` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_assessment_approved` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_assessment_reviewed` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_assessment_submitted` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_breach_detected` | active | DB: `trg_return_threshold_breach_notification` |
| `prudential_escalation_created` | active | Code: `index.ts, usePrudentialSupervision.ts` |
| `prudential_escalation_resolved` | active | Code: `usePrudentialSupervision.ts` |
| `prudential_return_validation_failed` | active | DB: `trg_return_validation_failure_notification` |
| `prudential_stress_indicator_triggered` | active | Code: `index.ts, usePrudentialSupervision.ts` |
| `prudential.early_warning_triggered` | active | DB: `trg_return_threshold_breach_notification` |
| `prudential.examination_assigned` | active | DB: `trg_examination_notifications` |
| `prudential.examination_finding_recorded` | active | DB: `trg_examination_finding_notification` |
| `prudential.examination_notice_issued` | active | DB: `trg_examination_notifications` |
| `prudential.group_contagion_alert` | active | DB: `trg_return_threshold_breach_notification` |
| `prudential.remediation_due` | active | DB: `notify_prudential_remediation_due` |
| `registration.action_taken` | active | Code: `index.ts, workflowVersioningMigration.test.ts` |
| `registration.approved` | active | DB: `trg_registration_approved_notification` |
| `registration.approved_step` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.comment_saved` | active | Code: `index.ts` |
| `registration.correction_required` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.escalated` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.final_approved` | active | Code: `index.ts, workflowVersioningMigration.test.ts` |
| `registration.final_rejected` | active | Code: `index.ts, workflowVersioningMigration.test.ts` |
| `registration.more_info_requested` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.new_submission` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.pending_review` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.received` | active | Code: `index.ts` |
| `registration.rejected` | active | Code: `ActionNotificationsEditor.tsx` |
| `registration.resubmission_requested` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.resubmitted` | active | Code: `PreLicenseeRegistration.tsx, workflowVersioningMigration.test.ts` |
| `registration.returned_for_correction` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.send_back` | active | Code: `ActionNotificationsEditor.tsx, index.ts, workflowVersioningMigration.test.ts` |
| `registration.step_assigned` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.step_entered` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.submitted` | active | Code: `index.ts` |
| `registration.workflow_completed` | active | Code: `workflowVersioningMigration.test.ts` |
| `registration.workflow_started` | active | Code: `workflowVersioningMigration.test.ts` |
| `regulator.action_taken_on_application` | active | Code: `index.ts` |
| `regulator.assignment_changed` | active | DB: `trg_licensee_regulator_assignment_notification` |
| `regulator.comment_added_or_query_raised` | active | DB: `trg_return_comment_notification` |
| `report.delivery_failed` | active | Code: `index.ts` |
| `report.first_delivery_success` | active | Code: `index.ts` |
| `report.scheduled_delivered` | active | Code: `index.ts` |
| `return.analysis_complete` | active | Code: `index.ts` |
| `return.approved` | active | DB: `perform_return_workflow_transition`; Code: `ActionNotificationsEditor.tsx, ReturnDetail.tsx, index.ts` |
| `return.approved_step` | active | Code: `ActionNotificationsEditor.tsx, index.ts, return-notification-payload.ts` |
| `return.breach_critical` | active | Code: `index.ts` |
| `return.breach_warning` | active | Code: `index.ts` |
| `return.comment_added` | active | DB: `tg_return_comment_added_audit`; Code: `ReturnDetail.tsx, return-notification-payload.ts, returnNotificationTemplates.test.ts` |
| `return.comment_saved` | active | DB: `perform_return_workflow_transition`; Code: `index.ts` |
| `return.edit_requested` | active | DB: `perform_return_workflow_transition`; Code: `ActionNotificationsEditor.tsx, ReturnDetail.tsx, return-notification-payload.ts` |
| `return.overdue` | active | Code: `index.ts` |
| `return.rejected` | active | DB: `perform_return_workflow_transition`; Code: `ActionNotificationsEditor.tsx, index.ts, return-notification-payload.ts` |
| `return.resubmission_requested` | active | Code: `index.ts` |
| `return.resubmitted` | active | DB: `resubmit_return`; Code: `FillReturnPage.tsx, index.ts, return-notification-payload.ts` |
| `return.resubmitted.confirmation` | active | Code: `FillReturnPage.tsx, index.ts, return-notification-payload.ts` |
| `return.rfi_raised` | active | DB: `trg_return_request_notification` |
| `return.send_back` | active | DB: `perform_return_workflow_transition`; Code: `ActionNotificationsEditor.tsx, index.ts, return-notification-payload.ts` |
| `return.submitted` | active | Code: `FillReturnPage.tsx, return-notification-payload.ts, returnActivityLogger.ts` |
| `return.submitted.confirmation` | active | Code: `FillReturnPage.tsx, return-notification-payload.ts, returnNotificationTemplates.test.ts` |
| `return.supervisor_escalation` | active | Code: `index.ts` |
| `return.validation_failed` | active | Code: `index.ts` |
| `return.validation_passed` | active | Code: `index.ts` |
| `return.workflow_action_taken` | active | Code: `ActionNotificationsEditor.tsx, index.ts, returnNotificationTemplates.test.ts` |
| `rule.activated` | active | DB: `trg_escalation_rule_activated_notification, trg_monitoring_rule_activated_notification` |
| `rule.first_fired` | active | DB: `trg_monitoring_rule_first_fired_notification` |
| `sla.breach` | active | DB: `notify_workflow_sla_events` |
| `sla.configuration_updated` | active | Code: `slaNotifications.ts` |
| `sla.warning` | active | DB: `notify_workflow_sla_events` |
| `supervisory_plan.created` | active | DB: `trg_supervisory_plan_created_notification` |
| `system_health.cron_failure` | active | Code: `index.ts` |
| `system_health.dispatch_failure_repeated` | active | Code: `index.ts` |
| `system_health.integration_failure` | active | Code: `index.ts` |
| `system_health.notification_queue_backlog` | active | Code: `index.ts` |
| `system_health.scheduler_failure` | active | Code: `index.ts` |
| `system_health.sms_provider_failure` | active | Code: `index.ts` |
| `system_health.smtp_failure_threshold` | active | Code: `index.ts` |
| `user.invited` | active | Code: `notificationEvents.ts` |
| `user.role_changed` | active | DB: `trg_user_role_change_notification` |
| `workflow.published` | active | DB: `trg_workflow_published_notification` |
| `workflow.sla_escalation` | active | Code: `index.ts` |
