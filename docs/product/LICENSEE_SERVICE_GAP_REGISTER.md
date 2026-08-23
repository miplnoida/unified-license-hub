# Licensee Service Gap Register

Input to the subsequent module-by-module functional completeness work. Gaps recorded here are
**not** advertised as available on the public site; the public catalogue either omits them or
classifies them honestly (`AVAILABLE_WITH_LIMITATIONS` / `REGULATOR_INITIATED_ONLY`).

| ID | Service | Gap | Current behaviour | Public classification | Impact |
|---|---|---|---|---|---|
| LSG-001 | Renew a Licence | No dedicated renewal journey; depends on the regulator configuring a renewal service and published post-licence form per licence type. No renewal window detection or pre-fill from the existing licence. | Entity uses the generic post-licence application journey (`/post-license/new`). | AVAILABLE_WITH_LIMITATIONS | Renewals may be unavailable for licence types without configuration. |
| LSG-002 | Request a Licence Variation | Variation categories are generic configured services; no variation-specific rules (for example control-change thresholds, notify-vs-approve routing). | Generic post-licence application journey. | AVAILABLE_WITH_LIMITATIONS | Regulator must interpret variation type manually. |
| LSG-003 | Surrender / Cancellation | No automated pre-submission checklist validating outstanding returns, fees, complaints or obligations. | Generic post-licence application journey; obligations continue until decision. | AVAILABLE_WITH_LIMITATIONS | Manual verification by the regulator before decision. |
| LSG-004 | Regulatory Deadlines | No consolidated entity deadline view aggregating returns, RFIs, renewals and remediation. | Deadlines shown per module (returns dashboard, requests, correspondence). | AVAILABLE_WITH_LIMITATIONS | Entity must check several screens to see everything due. |
| LSG-005 | Fit & Proper | No entity-facing workspace listing all fit and proper requirements, statuses and outcomes for an organisation. | Individual declarations via tokenised secure link; entity requests arrive via correspondence and the application journey. | REGULATOR_INITIATED_ONLY | Entity cannot self-serve F&P submissions outside an application or invitation. |
| LSG-006 | Examinations / Inspections | No entity-facing examination workspace (notice, information request list, finding responses, remediation evidence tracked against the examination). | Notices and requests reach the entity through correspondence and supervisory actions. | REGULATOR_INITIATED_ONLY | Examination interaction is not traceable to the examination record from the entity side. |
| LSG-007 | Enforcement Notices | No representation submission surface bound to the enforcement case with a governed response window. | Notices via correspondence; responses via supervisory actions. | REGULATOR_INITIATED_ONLY | Representations are not linked to the enforcement case lifecycle. |
| LSG-008 | Public licensee record | The public registry service publishes a limited field set; trading name, permitted activities, public conditions and previous names are not yet exposed by the public registry endpoint. | The record page renders "Not published" for these fields. | Public information | Public register is thinner than the target publication schema. |
| LSG-009 | Entity user management | No self-service screen for a primary representative to invite and manage additional authorised users from the entity portal. | Managed by the regulator through the licensee detail view. | AVAILABLE (access) | Primary representatives depend on the regulator to add users. |

Counts: `LICENSEE_SERVICE_GAPS_RECORDED = 9`, `ADVERTISED_BUT_NOT_IMPLEMENTED_SERVICES = 0`.
