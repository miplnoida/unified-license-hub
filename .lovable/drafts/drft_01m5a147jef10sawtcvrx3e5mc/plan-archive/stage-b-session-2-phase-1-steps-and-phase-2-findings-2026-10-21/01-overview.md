# Stage B, Session 2: Phase 1 steps and Phase 2 findings

## Phase 1: prepare the draft application (approved)
- **Applicant:** rodneybay.applicant@yopmail.com
- **Entity:** registry ID `cc331000-0000-4000-8000-000000000001`, the same ID used by every screen.

**Pause point for the email code.** My browser sessions don't stay open between messages, so I can't keep the registration screen waiting while you fetch the code. Two options:
- **A (recommended):** you open `/register` in the preview and fill the registration in up to the email code, using the details below, then submit.
- **B:** I fill it up to "Send code" and stop. You reopen the same screen and complete it yourself. This only works if the screen keeps the half-finished form, which I haven't confirmed.

Either way, you enter the code and handle the temporary password and first sign-in.

| # | Step | Screen | Who |
|---|---|---|---|
| 1 | Registration, entity "Rodney Bay Community Credit Union Ltd" and email code | `/register` → `/register/entity` → `/register/account` | **You** (with the code from YOPmail) |
| 2 | Confirm the entity match. If it is not an exact match, an officer chooses "resolve to existing" for `cc331…` | `/licensing/entity-resolution/:caseId` | entity resolution officer, plus supervisor if needed (decision by an authorised user; I only take the screenshots) |
| 3 | Approve the membership | `/admin/entity-memberships` | licensing officer (authorised user) |
| 4 | Temporary password and first sign-in | `/` | **You** |
| 5 | Fill in the 21 questions of the Credit Union form (version 2), upload documents, save as Draft | `/pre-license/new` → `/applications/:id/forms` | applicant. Once you are signed in, I fill the form in through the screen. |
| 6 | Check Entity 360 and Person 360 | `/entities/cc331…`, `/persons/:partyId` | licensing officer, read-only screenshots |

**Stop point:** application in Draft, with 0 payments and 0 licences. I don't submit.

## Details to enter (fictional)
- **Entity:** Rodney Bay Community Credit Union Ltd. Office on Rodney Bay Highway, Gros Islet. Co-operative registration CU-RB-2026-014.
- **Applicant contact:** Denise St. Rose, General Manager.
- **Directors:** Marcia Joseph (Chair), Kelvin Alexander (Treasurer) and Peter Francois (Compliance Officer).
- **Documents:** short PDFs marked "fictional, for presentation":
  - certificate of registration
  - by-laws
  - business plan
  - audited financial statements
  - director declarations
