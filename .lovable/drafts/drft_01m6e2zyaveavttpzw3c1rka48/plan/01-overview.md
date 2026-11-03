## Fix: final submission blocked for returned applications (APP-2026-002019)

**Cause (confirmed):** APP-2026-002019 has status `returned_for_correction`. The server-side form save command (`application_draft_save`) only allows saving in: draft, in_progress, returned, info_requested, query_raised, resubmission_required, pending_payment. `returned_for_correction` is missing, so the save performed during final submission is refused with APPLICATION_NOT_EDITABLE. The submit function itself already accepts this status.

**Change (database authorization — needs your approval):**
Stage an additive migration that redefines `application_draft_save` with `returned_for_correction` added to its allowed-status list. Nothing else in the function changes (ownership/membership checks stay identical).

Security impact: only the applicant/approved members who could already edit this application may now save it while it is returned for correction — the same people, one extra status. No new users, roles or records gain access.

**Tests:** add a SQL regression asserting the owner can save in `returned_for_correction` and a non-member still gets APPLICATION_EDIT_FORBIDDEN.

**Note:** as a draft schema change, it takes effect when you accept the draft; then resubmit APP-2026-002019.
