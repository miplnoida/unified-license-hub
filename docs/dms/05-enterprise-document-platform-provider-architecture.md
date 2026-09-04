# Enterprise Document Platform — Provider-Neutral Architecture (FINAL LOCK)

Baseline HEAD: `7bf9c958e589619641285aeb122b36fe567d07f0` (rebaselined from the expected
`cf420d9be0ab24249ebe21fc72199d51ea2664f8`; the intervening commits are the W1A.2 canonical
ingest closure and its documentation).

MODE: ARCHITECTURE ONLY. No code, no migrations, no UI in this wave. Nothing here is
implemented; nothing here may be read as implemented.

---

## 1. Core principle (permanent record)

**NO BUSINESS DOMAIN OWNS DOCUMENT CONTENT.**

Every document operation in the platform goes through one **Enterprise Document Gateway**.

| A business module MAY own | A business module MUST NEVER own |
| --- | --- |
| document requirements (which document types a process demands) | document blobs / content bytes |
| evidence requirements and evidentiary roles | physical storage (bucket, container, library, path) |
| business decisions taken on a document (accepted, verified, relied upon) | provider ids of any kind |
| relationships and purposes (why this document matters to this record) | provider-specific metadata |
| business references shown to officers | a module-local canonical document record |

Document Management is not another isolated business module. It is a **core enterprise platform
capability**, consumed identically by Licensing, Returns, AML/CFT, Prudential, Conduct, F&P,
Complaints, Examinations, Findings, Remediation, Enforcement, Correspondence and Entity 360.
The built-in repository is only the **first provider implementation**.

---

## 2. Platform layers

```text
A. BUSINESS DOMAINS      Licensing · Returns · AML/CFT · Prudential · Conduct · F&P ·
                         Complaints · Examinations · Findings · Remediation ·
                         Enforcement · Correspondence · Entity 360
                         (business context only — no storage knowledge)
                                   |
                                   v   one stable application contract
B. ENTERPRISE DOCUMENT GATEWAY     create · addVersion · chooseExisting · link · unlink ·
                                   search · preview · download · metadata · classify ·
                                   verify · accept · retention · hold ·
                                   controlled-document operations
                                   |
                                   v
C. DOCUMENT CONTROL PLANE (platform-owned, provider-independent)
   stable document reference · logical document identity · version ledger ·
   regulatory/business metadata · keywords & tags · business relationships ·
   classification policy · retention policy · audit & provenance ·
   controlled-document governance
                                   |
                                   v   provider binding (platform-internal only)
D. DOCUMENT PROVIDER               actual content repository
                                   INTERNAL_DOCUMENT_PROVIDER (today) |
                                   EXTERNAL adapter (SharePoint / OpenText / Alfresco / other)
```

Rule: layer A may only call layer B. Layer B is the only caller of layer D. Layer C never depends
on a provider. A provider swap is a change confined to layer D plus the binding rows in C.

---

## 3. Redefinition of the current canonical model

| Object today | Correct architectural meaning | Change of meaning |
| --- | --- | --- |
| `document_groups` | **Platform logical document identity** — the stable `DOC-…` reference and the thing every module relates to | unchanged, confirmed canonical |
| `document_versions` | **Platform version ledger** — server-allocated version identity and order | unchanged, confirmed canonical |
| `document_relationships` | **Canonical business-context relationships** (belongs_to / attached_to, evidentiary role) | unchanged, confirmed canonical |
| document metadata, `document_categories`, `document_types`, `classification_*`, retention policies, holds | **Platform regulatory metadata and policy** | unchanged, confirmed canonical |
| `file_uploads` (+ `file_upload_scan_events`) | **INTERNAL PROVIDER implementation record** — how the internal repository stores and scans an object | **corrected.** It is *not* the universal, provider-neutral truth of a physical document. When the provider is external there may be no `file_uploads` row at all |
| `secure-documents` / bucket paths / signed URLs / scan pipeline | **Internal provider implementation concerns** | **corrected** — no new business dependency permitted |

A conceptual **provider binding** replaces the assumption "a version always has a `file_uploads`
row". Physical location becomes a property of the binding, never of the document.

No schema is migrated in this wave.

---

## 4. Provider binding model (conceptual)

One binding row per (document version, provider) pair.

| Concept | Purpose |
| --- | --- |
| `provider` | which registered provider holds this content |
| `document_group` | platform logical document |
| `document_version` | platform version being bound |
| `provider_object_id` | the provider's identity for the content object |
| `provider_version_id` | the provider's identity for that specific version, where the provider versions natively |
| `provider_container` | library / site / folder / workspace / bucket in provider terms |
| `checksum` | content integrity, provider-independent, used to prove a migration copied the same bytes |
| `migration_status` | `active`, `migrating`, `migrated`, `superseded_binding`, `verification_failed` |
| `created_at`, `synchronised_at` | when bound, when last reconciled with the provider |

Rules:

1. Provider ids are **never** exposed above the Gateway. No module, hook, page, report or export
   may read them.
2. The **document reference is stable across provider change.** `DOC-2026-001245` is allocated by
   the control plane and never re-derived from a provider id.
3. Binding is per version, because providers version differently (native version chains, distinct
   objects, immutable records).
4. Content integrity across a provider move is proven by checksum, not by trusting the adapter.

---

## 5. One active provider per regulator

- The provider is configured **per regulator / tenant**, and normally exactly one provider is
  active for content creation.
- The provider is **not** configurable per business module. "AML documents in SharePoint, Licensing
  documents internally" is explicitly rejected: it recreates module-owned storage.
- During migration a document may temporarily hold **two bindings** (old `migrated`/`superseded`,
  new `active`). This is a *controlled migration state* with an explicit end, not a normal
  distributed-storage mode.
- Reads follow the `active` binding; a document whose new binding failed verification stays served
  from the old one and is reported as a migration exception.

---

## 6. Provider interface (provider-neutral operations)

The adapter contract, expressed as capabilities of content — not of business process. Names are
indicative.

| Operation | Contract |
| --- | --- |
| `createContent` | store first content for a platform version; return provider object/version ids + checksum |
| `addVersion` | store a further version of the same provider object, or a new object where the provider cannot version |
| `readContent` | return content or a short-lived, single-use access grant |
| `preview` | return a rendition, or declare the capability unsupported |
| `download` | authorised content transfer, always after the platform access decision |
| `dispose` | delete / destroy under a platform retention or disposal decision |
| `searchContent` | provider-side full-text/OCR match, returning provider object ids only |
| `readMetadata` / `writeMetadata` | map platform metadata to and from provider fields |
| `applyHold` / `releaseHold` | project a platform legal hold into the provider where supported |
| `healthCheck` | reachability, credential validity, capability confirmation |

Rules: business modules never call an adapter. The Gateway resolves the provider, applies the
platform decision first, and calls the adapter last. Adapters contain no regulatory logic.

---

## 7. Capability negotiation

Each registered provider declares support, and the Gateway degrades **visibly**, never silently.

| Capability | If unsupported |
| --- | --- |
| `VERSIONING` | platform version ledger remains authoritative; adapter stores each version as a separate object |
| `FULL_TEXT_SEARCH` | search runs on platform metadata only, and the UI states that content search is unavailable |
| `PREVIEW` | preview action is not offered; download remains |
| `CHECK_IN_OUT` | platform controlled-document locking is used instead |
| `METADATA` | platform metadata remains the only metadata; no synchronisation |
| `FOLDERS` | logical filing stays a platform view; nothing is materialised |
| `OCR` / `CONTENT_EXTRACTION` | extraction-dependent features are disabled, not approximated |
| `RETENTION` | platform retention schedule is the sole enforcement |
| `LEGAL_HOLD` | platform hold blocks disposal; provider hold is not claimed |
| `IMMUTABLE_RECORDS` | immutability is asserted only by the platform audit ledger |
| `EXTERNAL_SHARING` | external sharing is not offered |

**Do not fake unsupported capabilities.** A capability may only be advertised in the UI when the
active provider (or the platform itself) really enforces it.

---

## 8. Internal provider (current implementation)

`INTERNAL_DOCUMENT_PROVIDER` = today's implementation.

| Current asset | Reclassified as |
| --- | --- |
| `secure-documents` (and sibling private buckets) | internal provider container |
| `file_uploads` + `file_upload_scan_events` | internal provider object + integrity record |
| malware scan pipeline, `pending_scan` gate, quarantine | internal provider release control, surfaced to the platform as a release verdict |
| signed URLs | internal provider access grant transport |
| `dms_ingest_begin` / `dms_ingest_finalize` | the Gateway ingestion contract as implemented against the internal provider |

Declared capabilities of the internal provider: `VERSIONING` (platform-side), `METADATA`
(platform-side), `PREVIEW` (limited), `RETENTION`, `LEGAL_HOLD`. Not declared:
`FULL_TEXT_SEARCH`, `OCR` beyond existing extraction, `CHECK_IN_OUT`, `FOLDERS`,
`IMMUTABLE_RECORDS`, `EXTERNAL_SHARING`.

No new business module may depend on any row of that table.

---

## 9. External provider (future mapping)

Adapters must be possible for SharePoint / Microsoft 365, OpenText, Alfresco, or a customer DMS.
No vendor logic is designed here — only the mapping rule.

| External concept | Mapped to |
| --- | --- |
| object / item / node id | `provider_object_id` in the binding |
| native version chain | `provider_version_id` per platform version; platform ledger still authoritative for order and identity |
| site / library / folder / workspace | `provider_container`, derived by the active **filing profile** from platform context — never by module code |
| provider metadata columns / aspects / properties | mapped from platform metadata by the adapter's metadata profile; never read directly by modules |
| provider search / OCR index | a content-match input to the platform search service, returning provider object ids resolved back to platform documents |
| provider rendition service | `preview` |
| provider retention labels / holds | projections of platform retention and hold decisions, applied after the platform decision |

The platform never adopts an external id as a business reference and never lets an external
folder move change a business relationship.

---

## 10. Logical filing structure (provider-neutral)

Filing is a **logical view** owned by the platform:

```text
Entity → Licensing  → Application       → Document Type
Entity → Returns    → Reporting Year    → Filing
Entity → Supervision→ AML/CFT           → Assessment
```

These views are computed from `document_relationships` plus platform metadata. The **active
provider adapter alone** decides whether they are materialised as physical folders, libraries,
workspaces or purely as metadata classifications, driven by a configured filing profile.

Invariant: **changing provider, or changing a filing profile, must not change a business
relationship.** Filing is presentation and physical placement; relationships are regulatory fact.

---

## 11. Metadata ownership

Platform-owned and stable independent of provider: reference, title, description, entity, module,
business object, business reference, category, type, document date, effective dates, reporting
period, owner/team, keywords, tags, classification/confidentiality, retention, verification
status, acceptance status, jurisdiction, language, and controlled-document metadata (revision,
review, approval, effective window, acknowledgement).

Provider-specific metadata is **mapped** by the adapter and never surfaced to a business module.
If a provider loses or mangles a mapped field, the platform value remains authoritative.

---

## 12. Keywords and taxonomy

Two distinct, both platform-owned:

- **Governed keyword taxonomies** — controlled vocabularies, versioned, used for regulatory
  classification and reporting.
- **Free-form user tags** — officer convenience, never a control input.

Adapters may synchronise either into provider metadata. Synchronisation is one-way from the
platform unless a provider is explicitly declared authoritative for a field, which is not the
case for any governed vocabulary.

---

## 13. Central search

One **Document Search Service** behind the Gateway. It combines, where available:

platform metadata · document reference · entity and business references · governed keywords ·
free-form tags · custom metadata · provider full-text / OCR content match.

It returns **one security-filtered result model**. React and business modules never learn which
engine or provider produced a content match, and never receive provider ids. Where content search
is unavailable for the active provider, the result set states the reduced coverage rather than
implying a complete search.

Result contract follows the Enterprise Listing Contract: server paging, whitelisted sort/filter
keys, deterministic tie-break, `total_count` from the same filtered and security-filtered
population — never fabricated, never pre-filter.

---

## 14. Security model

1. **Platform entitlement is authoritative** for application access: classification and
   confidentiality, entity scope, business authority, module permissions.
2. Provider security may add a **second, narrower** enforcement layer.
3. **Final access is never broader than platform entitlement.** A provider that would grant more
   does not widen access; the Gateway decision stands.
4. **Search must not leak.** Counts, facets and result rows are computed after the platform
   visibility filter. A provider content match on an inaccessible document contributes nothing —
   not a row, not a count.
5. External integration may not bypass classification, entity scope, retention, legal hold or
   business authority. Adapter credentials carry no regulatory authority.
6. Provider access grants are short-lived, single-purpose and issued only after the platform
   decision.

---

## 15. Ingestion contract (target)

The business module supplies only: **context** (entity / business record and purpose),
**document type**, **metadata not derivable** from context, and the **file/content**.

The Document Gateway then, as one governed operation:

1. resolves the active provider for the tenant;
2. registers stable document identity (logical document + reference);
3. persists business and regulatory metadata, classification, retention;
4. uploads content through the provider adapter;
5. records the provider binding (object id, version id, container, checksum);
6. creates the canonical business relationships;
7. records audit and provenance.

Modules never provide a bucket, storage path or provider object id. The current
`dms_ingest_begin` / `dms_ingest_finalize` pair is exactly this contract bound to the internal
provider; making it provider-resolving is an implementation step for a later wave.

---

## 16. Choose Existing

Search the central Gateway → select a stable platform document → **create a relationship only**.

No content copy. No new version. No provider-specific operation from the module. Authority is
checked on the link, and repeated links are idempotent.

---

## 17. New version

Same platform document, new **platform** version; the adapter then creates the corresponding
provider version or object. **The server allocates version identity.** No module-local
versioning, no client-computed version number, no module-owned "latest" flag.

---

## 18. Current module-local stores — rebaseline classification

| Store / path | Classification | Target |
| --- | --- | --- |
| `document_groups` / `document_versions` / `document_relationships` / taxonomy / retention / holds | **PLATFORM** | control plane, unchanged |
| `dms_*` RPCs, `src/services/dms.ts`, `src/services/dmsIngest.ts` | **PLATFORM** | becomes the Gateway surface |
| `file_uploads`, `file_upload_scan_events`, `secure-documents` bucket, signed URLs, scan pipeline | **INTERNAL_PROVIDER** | provider implementation only |
| `secureUpload` (`src/lib/secureFileUpload.ts`) and its callers (`complaintAttachments`, `DocumentUpload`, `FilingLifecyclePanel`, `MyComplaintRfis`) | **COMPATIBILITY** | no new callers; migrate to Gateway ingest |
| `uploadVersionedDocument` / `create_document_version_metadata` (Form Management) | **COMPATIBILITY** | preserved for certified form flows; converge later |
| `complaint_evidence` | **MIGRATE_LATER** | relationships + evidentiary role over platform documents |
| `conduct_evidence`, `conduct_signal_evidence` | **MIGRATE_LATER** | same |
| `correspondence_attachments` | **MIGRATE_LATER** | canonical documents; correspondence keeps the regulatory record |
| F&P evidence (`fp-evidence` paths) | **MIGRATE_LATER** | same |
| Return uploads / return evidence | **MIGRATE_LATER** | same |
| Payment documents | **MIGRATE_LATER** | same |
| `dms_register_certificate` | **PLATFORM (special-purpose)** | licence certificates only |
| legacy `documents` table (3 rows) | **LEGACY_FROZEN** | read-only until retired |

**Target state: zero module-owned document repositories.** Nothing is migrated in this wave.

---

## 19. Document Management Console — terminology

The **Document Management Console** is the management, search and governance **UI over the
Enterprise Document Platform**. It is *not* a separate place where different documents live.

A document visible in AML/CFT, Licensing or Returns **is the same document** as in the console —
same logical document, same reference, same version ledger, same metadata, same audit. The console
shows more governance affordances (classification, verification, retention, holds, controlled
revisions, reconciliation) because of permissions, never because it holds different content.

---

## 20. Administration ▸ Document Platform (configuration model)

| Configuration area | Contents |
| --- | --- |
| Repository provider | active provider per regulator/tenant, status, health, migration state |
| Provider capability mapping | declared capabilities, verified by `healthCheck`, drive UI affordances |
| Filing profiles | how logical filing maps to provider containers or metadata |
| External folder / workspace mapping | site, library, path templates derived from platform context |
| Document types & categories | taxonomy, defaults for confidentiality, verification, acceptance, retention |
| Metadata profiles | platform field ↔ provider field mapping per provider |
| Keyword taxonomies | governed vocabularies and their versions; tag policy |
| Module document policies | required types, evidentiary roles, mandatory verification per process |
| Classification | confidentiality scheme and escalation permissions |
| Retention | schedules, disposal authority, hold policy |
| Ownership & routing | owning team, reviewer/approver routing for controlled documents |
| Search & extraction | which sources participate, OCR/extraction settings |
| Controlled-document policies | lifecycle, maker-checker, effective dating, acknowledgement |

**Provider credentials and secrets are handled by the secure configuration/secret infrastructure**
— never stored as ordinary business metadata, never displayed, never returned by a read RPC.
Administration configures *references* to secrets, not values.

---

## 21. Provider replacement test

Scenario: today `provider = INTERNAL`; tomorrow `provider = EXTERNAL_DMS`; document
`DOC-2026-001245` is migrated.

| Requirement after migration | Satisfied by |
| --- | --- |
| Same document reference | reference lives in the control plane (§3, §4.2) and is never derived from a provider id |
| Same entity relationship | `document_relationships` untouched by provider change (§10 invariant) |
| Same AML evidence relationship | same — evidentiary role is a control-plane relationship attribute |
| Same filing relationship | filing is a logical view computed from platform data (§10); only the provider container changes |
| Same metadata | platform-owned metadata (§11); provider metadata is a mapped projection |
| Same permissions | platform entitlement is authoritative and provider security may only narrow (§14) |
| Same audit history | audit and provenance are control-plane, plus a migration event on the binding |
| No AML / Licensing / Returns code change | modules call only the Gateway (§1, §2); provider ids never crossed the boundary |

What actually changes: the binding rows (new `active` binding with verified checksum, old marked
`migrated`), the active provider configuration, and the capability set (which may enable content
search or preview, or disable an unsupported affordance).

**PROVIDER REPLACEMENT TEST — PASS** (conceptual; the binding layer and provider resolution are
not implemented and this document does not claim otherwise).

---

## 22. Freeze

This is the **final DMS architecture planning wave**. No broad DMS implementation follows it.
The platform team returns to AML/CFT completion. DMS implementation resumes later against this
frozen architecture, in the wave sequence already recorded in
`docs/architecture/platform-master-implementation-plan.md`, with the provider binding and provider
resolution as the first implementation increments.
