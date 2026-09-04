# DMS — Document Control Master Architecture (target design)

Baseline HEAD: `302538690e0ad0090fc64cfaea31d7df52c864cb`. Analysis only — no schema, no code.
Builds on the canonical DMS foundation (`00_source_inventory.md`, `01_canonical_mapping.md`,
`02_access_matrix.md`). Nothing in the existing foundation is replaced.

## 1. Three separated concerns

| Layer | Question it answers | Canonical store | State today |
|---|---|---|---|
| **1. Document Repository** | "What file exists, who may see it, where is it, is it clean?" | `file_uploads` (physical) + `document_groups`/`document_versions` (logical) + classification/retention/holds | CANONICAL |
| **2. Controlled Documents** | "Which revision of this policy is *in force*, who approved it, when did it become effective, who must acknowledge it?" | none — must be added as a control layer *on top of* `document_groups` | FUNCTIONAL_GAP |
| **3. Records & Evidence** | "What proves this regulatory act? Which document is attached to this application / filing / finding, in what evidentiary role?" | `document_relationships` (+ module evidence stores still outside) | PARTIAL |

Design rule: **one document record, three governance overlays.** A controlled document is a
`document_groups` row with a control profile; a record/evidence item is the same row with a
relationship and an evidentiary role. There is no second document table, no second file
registry, no second reference series.

## 2. Controlled document model (target, conceptual)

- **Controlled document** — identity of the governed artefact: document type (policy, procedure,
  SOP, methodology, guideline, circular, standard, template, form, manual), owning business unit,
  domain, jurisdiction, classification, numbering series, review periodicity, acknowledgement
  requirement. Points at one `document_groups` row.
- **Controlled revision** — the governed unit of change: revision label (major.minor),
  change reason, change summary, materiality, the working `document_versions` row it was cut
  from, review record, approval record, effective window (`effective_from`, `effective_to`),
  supersedes pointer.
- **Working file version** stays `document_versions` — uncontrolled, freely re-uploaded.
- **Approved revision** = a revision with a recorded approval decision.
- **Effective revision** = the single revision whose effective window contains the as-of date.
  Exactly one per controlled document per instant; enforced server-side, not by convention.

Separation is deliberate and matches the pattern already proven in Returns
(filing vs immutable filing version) and in supervisory methodology versioning.

## 3. Lifecycle (minimum justified set)

```text
DRAFT ──► IN_REVIEW ──► REVIEW_COMPLETE ──► PENDING_APPROVAL ──► APPROVED
             │                                     │                │
             └──► CHANGES_REQUESTED ──► DRAFT       └──► CHANGES_REQUESTED
                                                                    │
                                    SCHEDULED_EFFECTIVE ◄───────────┘ (future effective date)
                                                │
                                             EFFECTIVE ──► REVIEW_DUE ──► (new revision)
                                                │
                                    SUPERSEDED / WITHDRAWN ──► ARCHIVED
```

Justification for keeping each state, and what is *not* created:

- `REVIEW_COMPLETE` is kept only because specialist review and approval are different
  authorities; without it, "reviewed" and "awaiting approval" collapse and maker-checker
  evidence is lost.
- `SCHEDULED_EFFECTIVE` is kept because regulatory instruments are routinely approved before
  they bite; without it, approval date is misread as effective date.
- `REVIEW_DUE` is a *derived* flag on `EFFECTIVE`, not a separate stored state.
- No `PUBLISHED` state: publication to the Public Registry is a separate publication workflow
  on the repository layer (`publication_status` already exists) — it is not document control.
- No per-reviewer states. Reviewer progress lives in review records, not in the lifecycle.

## 4. Decision authority model

Configurable roles (all resolved from configuration; **no hard-coded person names, ever**):

| Role | Authority |
|---|---|
| Author | Creates/edits the draft and the working file version |
| Document Owner | Accountable for content and for the review cycle |
| Document Controller | Numbering, classification, register hygiene, revision issuance — *administration only* |
| Reviewer | Records review outcome (`ok` / changes requested) |
| Specialist Reviewer | Mandatory review by discipline (legal, risk, AML, IT security) |
| Approval Authority | The only role that may record `APPROVED` |
| Publisher | Makes an effective revision available to its audience |
| Records Officer | Retention, holds, archival, disposition |
| Recipient / Acknowledger | Must acknowledge receipt/reading where required |
| Administrator | Configures types, policies, series, routing — no business approval |

Invariants:

1. **Workflow administration ≠ business decision authority.** `document_management.manage_config`
   never implies approval.
2. **Maker-checker default:** the author or reviser of a revision may not approve it; the same
   user id may not hold both the review and the approval record on one revision unless an
   explicit, audited override policy allows it.
3. **Administrator does not inherit approval.** Break-glass stays with `super_admin` only,
   consistent with `is_break_glass` in the role catalogue.
4. Approval policy is configurable by **document type × business unit × domain × jurisdiction ×
   classification**, plus materiality where the type declares it (e.g. a minor editorial revision
   of an SOP may need one approver; a methodology change needs the methodology owner + legal).
5. Every decision is an RPC with actor, authority basis, timestamp and rationale. No client writes.

## 5. Records & Evidence

Evidence is a *typed relationship* from a canonical document to a business record — never a copy:

`document_relationships(document_group_id, relationship_type, target_type, target_id, evidentiary_role, required, satisfied_at)`

Target types in scope: application, RFI, licence, condition, filing, assessment, dimension,
examination, workpaper, finding, remediation action, complaint, investigation, enforcement action,
correspondence message, entity.

Rules: a requirement is satisfied only by a canonical document with a clean scan status; removing
an evidence link is a governed, audited act (never a hard delete); retention is inherited from the
document type unless a hold overrides it; a document may satisfy several requirements without
duplication.

## 6. Shared document experience (one component set for all modules)

| Component | Responsibility |
|---|---|
| `DocumentPanel` | Documents in a business context, canonical listing rules |
| `EvidencePanel` | Requirements vs satisfied evidence, with gaps |
| `UploadDocument` | Registers a canonical document + version (never a raw storage write) |
| `DocumentPicker` | Reuse an existing canonical document as evidence |
| `DocumentPreview` | Signed-URL preview honouring `dms_can_view_document` |
| `VersionHistory` | Working versions + controlled revisions, clearly distinguished |
| `DocumentRelationships` | Contexts this document serves |
| `DocumentActions` | Verify / accept / classify / hold / archive / restore, permission-driven |
| `DocumentActivity` | `document_action_logs` timeline |
| `ControlledDocumentWorkspace` | Review/approval/effective-date surface for controlled docs |

Every one of them calls `src/services/dms.ts`. Modules may not talk to storage or to
`document_groups` directly. Existing `src/components/documents/*` and `documents/versioned/*`
are the starting point and must be folded into this set rather than forked.

## 7. UX operating model

```text
Documents
  My Document Work        (drafts, reviews assigned to me, approvals awaiting me, acknowledgements)
  Controlled Documents    (policies, procedures, SOPs, methodologies, circulars — by type/unit/domain)
  Records & Evidence      (business-context oriented)
  Review & Approvals      (queues; projects into supervisory_work_item)
  Document Register       (technical, full-population, power users)
  Retention & Holds       (Records Officer)

Administration ▸ Document Management
  Categories & Types · Classification · Numbering · Approval Policies · Review Rules · Retention · Templates
```

The technical Document Register stops being the entry point. All listings follow the enterprise
listing contract: server paging (1-based, 10/25/50/100), whitelisted sort/filter keys,
`total_count` from the same filtered population, URL-persisted state, owner-level invalid-page repair.

## 8. Cross-module integration map

| Module | Documents created | Documents received | Evidence required | Generated artefacts | Document decisions |
|---|---|---|---|---|---|
| Licensing | acknowledgement letters, decision notices, licence certificates | application supporting docs, RFI responses | constitution, ownership, F&P packs, financials | certificate (already `dms_register_certificate`), decision artefact | verify, accept, publish certificate |
| Returns | validation/rejection notices | filing attachments, templates | signed financial statements, auditor reports | filing version PDF, late-fee notice | accept, verify |
| AML/CFT | assessment reports, methodology (controlled) | AML policies, programme docs, STR governance evidence | policy, risk assessment, training records | assessment report, dimension evidence pack | approve methodology, accept evidence |
| Prudential | assessment/ratio reports, EWI notes | financials, capital plans | audited accounts, stress submissions | assessment report, breach notice | accept, verify |
| Conduct | intelligence notes, pattern reports | complaint files, marketing material | conduct policy, disclosures | supervisory attention record | accept |
| Fit & Proper | determinations, conditions | declarations, police/credit checks | ID, qualifications, references | determination notice | accept, restrict (high sensitivity) |
| Examinations | scope docs, workpapers, exam report | pre-exam request responses | requested records | draft/final report, management response | approve report |
| Findings | finding letters | management responses | corrective-action evidence | closure memo | validate evidence |
| Remediation | progress notices | remediation evidence | proof of implementation | closure pack | validate |
| Enforcement | notices, orders, settlements | representations | full case evidence bundle | enforcement order (controlled + published) | approve, publish |
| Complaints | outcome letters | complainant evidence | consent, transaction records | resolution record | accept, redact |
| Investigations | investigation reports | seized/obtained records | chain-of-custody evidence | report | approve, restrict |
| Correspondence | all outbound messages | all inbound messages | — | dispatch evidence | attach canonical document |
| Entity 360 | — | — | — | consolidated document view | none (read-only aggregation) |

Retention and classification always come from the document type, then the category, then an
explicit recorded override — the rule already implemented in the foundation.

## 9. What must not happen

- No parallel document/file table, no second reference series, no per-module version numbering.
- No controlled-document state written from the browser.
- Module evidence stores (`complaint_evidence`, `conduct_evidence`, `fp-evidence`,
  `correspondence_attachments`, `return-uploads`, payment documents) are *linked*, then migrated
  wave by wave with explicit chain-of-custody preservation. They are never dual-written.
- The legacy `documents` table (3 rows) stays readable until its wave; it is not authoritative.
