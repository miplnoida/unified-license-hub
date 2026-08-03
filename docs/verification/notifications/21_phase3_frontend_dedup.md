# Phase 3 — Frontend emission removal (deduplication)

Every notification event that now has a verified backend call site (database trigger, RPC or
edge function) has had its duplicate frontend `dispatchNotificationEvent` call removed, so the
event is emitted exactly once, at the transaction boundary.

| File | Event keys removed | Backend owner |
| --- | --- | --- |
| `src/hooks/useLicenseAppeals.ts` | `license_appeal.filed`, `.acknowledged`, `.panel_assigned`, `.decided` | `notify_license_appeal` trigger on `license_appeals` |
| `src/hooks/useMarketConduct.ts` | `conduct_investigation_*`, `conduct_evidence_*`, `conduct_alert_*`, `conduct_action_completed/waived/cancelled` | `notify_conduct_*` triggers |
| `src/hooks/usePrudentialSupervision.ts` | `prudential_assessment_*`, `prudential_action_*`, `prudential_escalation_*`, `prudential_stress_indicator_triggered` | `notify_prudential_*` triggers, `notify_overdue_prudential_actions` sweep, `evaluate-return-prudential` |
| `src/components/conduct/IssueActionDialog.tsx` | `conduct_action_created` | `notify_conduct_action` trigger |
| `src/components/applications/RaiseRfiDialog.tsx` | `application.rfi_raised` | `notify_application_rfi_raised` trigger |
| `src/components/correspondence/ResponseComposer.tsx` | `correspondence.response_sent` | `notify_correspondence_message` trigger |
| `src/pages/entity/correspondence/MyCorrespondenceDetail.tsx` | `correspondence.reply_received` | `notify_correspondence_message` trigger |
| `src/pages/admin/SlaManager.tsx` (+ deleted `src/lib/slaNotifications.ts`) | `sla.configuration_updated` | `notify_sla_configuration_updated` trigger, plus new `notify_sla_escalation_tier_updated` trigger on `sla_escalation_tiers` |

## Retained frontend emissions (intentional)

| File | Event keys | Reason |
| --- | --- | --- |
| `src/hooks/useFormTemplates.ts` | `form_version.*` (manual notify) | Explicit administrator "Send notification" action, not a state change; the publish state change is separately covered by `notify_form_version_published`. |
| `src/hooks/useCollabReview.ts` | `collab_review.*` | No active `notification_event_configs` row; legacy template-driven path only, so no active-event gap. |
| `src/components/applications/ApplicationRfiTab.tsx` | `application.rfi_closed` | No active event configuration exists for this key; kept until an event config and trigger are seeded. |

## Post-change scan

`node scripts/notification-trigger-scan.mjs`

- Active events: 212
- Unwired active events: 0
- Wired but never executed: 156
- Deactivated: 2
