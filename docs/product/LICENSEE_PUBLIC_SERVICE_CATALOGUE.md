# Licensee Public Service Catalogue

Source of truth: `src/lib/publicServices/catalogue.ts`.
Public surfaces: `/licensee-services`, `/licensee-services/:slug`, homepage "Already regulated?" section.

Classification legend:

- `AVAILABLE` — implemented end-to-end for entity users today.
- `AVAILABLE_WITH_LIMITATIONS` — implemented, but depends on regulator configuration or delivered through a generic journey.
- `REGULATOR_INITIATED_ONLY` — the entity cannot start it; it reaches the entity when the regulator issues it.
- `NOT_IMPLEMENTED` — never rendered publicly.

| Service | Public description | Audience | Public route | Authenticated route | Initiated by | Status | Authority / capability | Known gaps |
|---|---|---|---|---|---|---|---|---|
| New Licence / Authorisation | Apply for a new regulatory licence or authorisation. | Applicant, Primary entity representative | `/licensee-services/new-licence`, `/register/applicant` | `/applications` | Entity | AVAILABLE | Preparation delegable; submission requires submission authority (`can_submit`) | — |
| Renew a Licence | Submit a renewal request for an existing licence where renewal is applicable. | Primary entity representative, Authorised entity user | `/licensee-services/licence-renewal` | `/post-license/new` | Entity | AVAILABLE_WITH_LIMITATIONS | licensing area, `can_submit` | Generic post-licence journey; requires configured renewal service + published form; no renewal-window pre-fill |
| Request a Licence Variation | Request approval for a change to an existing licence or its conditions. | Primary entity representative, Authorised entity user | `/licensee-services/licence-variation` | `/post-license/new` | Entity | AVAILABLE_WITH_LIMITATIONS | licensing area, `can_submit` | Variation types are configuration-driven; no variation-specific validation |
| Surrender / Cancellation Request | Request surrender or cancellation of a licence no longer required. | Primary entity representative | `/licensee-services/licence-surrender` | `/post-license/new` | Entity | AVAILABLE_WITH_LIMITATIONS | licensing area, `can_submit` | No automatic outstanding-obligation checklist; suspension/revocation remain regulator powers |
| Regulatory Returns | View obligations and due dates, prepare, validate and submit returns. | Primary entity representative, Authorised entity user | `/licensee-services/regulatory-returns` | `/entity/returns` | Entity | AVAILABLE | returns area, `can_view_status` to view, `can_submit_returns` to file | — |
| Regulatory Deadlines | Track regulatory deadlines applicable to the organisation. | Primary entity representative, Authorised entity user | `/licensee-services/regulatory-deadlines` | `/entity/returns/dashboard` | Either | AVAILABLE_WITH_LIMITATIONS | returns area, `can_view_status` | No consolidated cross-module deadline calendar |
| Fit & Proper Submissions | Provide information on directors, controllers and key function holders. | Primary entity representative, Authorised entity user | `/licensee-services/fit-and-proper` | `/entity/correspondence` (+ secure declaration link) | Regulator | REGULATOR_INITIATED_ONLY | entity portal user; individual declarations via tokenised link | No entity-facing F&P requirement workspace |
| Respond to Regulatory Requests | Respond to information, document and remediation requests. | Primary entity representative, Authorised entity user | `/licensee-services/regulatory-requests` | `/entity/supervisory-actions` | Regulator | AVAILABLE | entity membership verified server-side by `submit_prudential_action_response` | — |
| Regulatory Correspondence | Access official correspondence issued to the entity. | Primary entity representative, Authorised entity user | `/licensee-services/correspondence` | `/entity/correspondence` | Regulator | AVAILABLE | entity portal user; RLS scoped to entity | — |
| Respond to Regulatory Matters | Respond to a request concerning a complaint or conduct matter. | Primary entity representative, Authorised entity user | `/licensee-services/conduct-response` | `/entity/complaint-rfis` | Regulator | AVAILABLE | entity portal user; complainant-private data withheld | — |
| Examination & Inspection Requests | Receive examination notices and submit requested evidence. | Primary entity representative, Authorised entity user | `/licensee-services/examinations` | `/entity/correspondence` | Regulator | REGULATOR_INITIATED_ONLY | entity portal user | No dedicated entity examination workspace |
| Enforcement Notices & Representations | Access governed notices and submit representations where applicable. | Primary entity representative, Authorised entity user | `/licensee-services/enforcement-notices`, `/registry/enforcement` | `/entity/supervisory-actions` | Regulator | REGULATOR_INITIATED_ONLY | entity portal user | No representation surface bound to the enforcement case |
| Portal Access for Your Organisation | Obtain access for the organisation and manage authorised users. | Primary entity representative, Authorised entity user | `/licensee-services/portal-access`, `/register/entity` | `/profile` | Entity | AVAILABLE | Access is organisation-scoped; submission authority is separate from access | — |

## Public vs secure boundary

Public: licence register, regulated entity register, published enforcement outcomes, general guidance, service process information.

Secure (sign-in required): returns and filing history, correspondence, requests, fit and proper submissions, application details, obligations and deadlines, private notices, entity user management.

Every public licensee-facing page renders a `Sign In` action in the header (desktop and mobile) plus a contextual sign-in CTA next to the relevant content. Sign-in CTAs use `signInHref()`, which only ever emits a same-origin relative `redirect` parameter; `Login` re-validates that the target begins with `/` and is not protocol-relative.
