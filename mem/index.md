# Project Memory

## Core
- Real working system, never a prototype: no mock data, no placeholder handlers, no client-side business outcomes. See [Real Working System Rule](mem://engineering/no-mock-real-system-rule).
- Every visible action needs the full chain: UI → hook → governed RPC → RBAC/scope → validation → canonical mutation → audit → refreshed UI. Build missing backend in the same wave.
- Report acceptance per feature (data source, read path, action path, persistence, authorization, audit); scale tests to the change.
- Enterprise UI/UX mandatory: compact header → toolbar → content, no explanatory prose, shared PageHeader/RegisterToolbar, standard Lucide action icons. See [Enterprise UI/UX Standard](mem://design/enterprise-ui-ux-rule).

## Memories
- [Real Working System Rule](mem://engineering/no-mock-real-system-rule) — No-mock mandate, real action chain, server authority, acceptance reporting format, test proportionality
- [Enterprise UI/UX Standard](mem://design/enterprise-ui-ux-rule) — Screen density rules, page header/toolbar/register standards, canonical action-icon catalogue


- [Location Master Data](mem://features/master-data/location-hierarchy) — Worldwide Country/State/City hierarchy powering cascading address dropdowns
- [Regulatory Data Model](mem://architecture/regulatory-data-model) — RDM-ENTITY-001: metadata governance (RPC-only writes, single active default, identifier scopes) and Phase 2A party/organization/regulated-entity/multi-licence foundation
- [Breadcrumbs](mem://navigation/breadcrumbs) — Derived trail from nav tree + route registry, business labels never UUIDs
- [Navigation Domains & Coverage](mem://navigation/approvals-and-coverage) — Nine canonical sidebar domains, no global Approvals root, every route reachable
- [Role Catalogue](mem://features/rbac/role-catalogue) — 48 DB-governed role templates, officer/supervisor maker-checker split, break-glass only for super_admin

- [Registration Journeys](mem://features/registration/two-route-public-journeys) — FORM_FIRST vs ENTITY_FIRST public routes and governed resolution
- [Environment Safety](mem://security/environment-safety-guard) — Production classification, fail-closed destructive tooling guard, cutover drops
- [Small Regulator Demo Seed](mem://features/small-regulator-demo-seed) — Non-production multi-function staffing demo data and its cleanup script
- [Operating Structure IA](mem://features/operating-structure/simplified-ia) — 5 admin tabs, plain-language wording, mandates behind advanced settings
- [Operating Structure Task UX](mem://features/operating-structure/task-first-ux) — dedicated lead/staff/member dialogs, single applicable-areas resolver

- [FSRA Sector Model](mem://features/operating-structure/fsra-sector-model) — Saint Lucia FSRA regulator, 9 active grouped sectors, retired legacy sectors
- [Sector Alias Map](mem://architecture/sector-alias-map) — Legacy-to-active FSRA sector resolution for licence entitlement and returns obligations
- [Returns Filing Workspace](mem://features/returns/filing-workspace-and-financial-rules) — Form-level navigator, Review & Submit, configurable balance-sheet equation
- [Methodology Approval Layers](mem://features/methodology/reference-vs-regulator-approval) — MIPL reference approval never counts as regulator approval
- [Methodology Authority](mem://features/methodology/regulator-scoped-authority) — Regulator scope, methodology vs assessment approval, technical vs substantive authority
