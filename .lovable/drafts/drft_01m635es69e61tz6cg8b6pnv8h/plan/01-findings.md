## Cross-institution application access: read-only audit

Nothing was changed. I only read function definitions, access rules and permission tables. Counts were run on membership and role tables. No application content was opened.

### Root cause (confirmed)
`has_portal_capability(user, entity, area, capability)` **never uses the `entity` argument**. For an external user it only asks whether the user holds the module permission (`sec_has_permission`). Every check built on it therefore answers "does this user have the permission anywhere?" and never "for this institution?":

- `external_can_access_application`
- `_application_values`
- `_license`
- `_payment`
- `_document_ref`
- `_upload_document_ref`

`can_read_application`, `can_mutate_application`, `fee_can_view_application_finance` and the file and payment rules inherit this. It applies whenever an application is linked to **any** institution (form-data stamp, the applicant's profile link, or a licence).

### What is actually exposed
Exposure depends on which permission word each caller passes. Licensing permissions that exist are `view`, `view_status`, `submit`, `upload_documents` and `respond_rfi`. There is **no** `can_view`.

| Area | Check used | Exposed across institutions? | Severity |
|---|---|---|---|
| Application record, submitted forms, RFIs and responses, acknowledgements, AI assessment, form versions | `can_read_application` → `'can_view'` | **No.** The broken branch asks for a permission that doesn't exist, so it never passes. | Latent (High once anyone adds `can_view`) |
| Secure-document files (storage) | `sec_secure_document_readable` → `'can_view'`, then same-organisation uploader | **No** | Latent |
| `documents` table | Restrictive gate. The permissive rule is uploader or internal only. | **No** | Low |
| `payments` table | Restrictive gate. The permissive rule is own or admin only. | **No** | Low |
| **Payment receipts, remarks, attachments** | `fee_can_view_payment` → `fee_can_view_application_finance(...,'view')` | **Yes.** Primary, Secondary and Applicant users hold `licensing.view`. | **High** (read) |
| **Fee functions** (`fee_assessment_state`, `_preview`, `_ensure`, `create_or_get_application_payment`, `complete_or_get_…`, `submit_offline_payment`, `fee_waiver_request`, `fee_refund_request`) | `fee_can_view_application_finance` | **Likely yes**, by direct API call with another application's id. Needs a confirming negative test. | **High** (read, possibly write) |
| **`file_uploads` rows** (file name, path, type) | Permissive rule using `can_view_status` | **Yes**, metadata only. Most external roles hold `view_status`. The file bytes stay protected (row above). | **Medium** |
| **Application update** | `applications_update` → `can_mutate_application` → `'can_submit'`/`'can_respond_rfi'` | Targeted updates are blocked because the row must also be readable. An unfiltered bulk update is not proven safe. Workflow, context and decision triggers limit what could change. | **Medium–High (unconfirmed)** |
| Licences, other `document_ref` types, payment insert and update gates | Same pattern | Restrictive gates, plus owner rules. Needs a per-caller check. | To verify |

**Affected roles:** external users holding licensing permissions:
- `licensee_primary_user`
- `licensee_secondary_user`
- `applicant_user`
- `pre_licensee_user`
- `entity_ppoc` (`view_status` only)
- `regulated_entity_user`

Regulator staff aren't affected; they already have legitimate wide access.

**Hidden from lists ≠ protected:** the list function scopes correctly. The exposures above are reachable only by calling the API directly with another application's id or payment id. No screen links to them.
