# Hide the "Information Requested" section on the Submitted Forms tab

On the applicant's application page, the "Information Requested" card (heading, explanation, Remarks box, Resubmit / Cancel buttons) is rendered below the tab area, so it appears no matter which tab is open — including Submitted Forms. The request is to hide it while the applicant is viewing Submitted Forms.

## Behaviour after the change

- Opening the **Submitted Forms** tab: the "Information Requested" card is not shown, so the tab is purely the forms.
- On every other tab (Details, Documents, Payment, RFI, etc.): the card still shows exactly as today, including the Remarks field and the Resubmit Application button.
- Nothing changes for the "Resubmission Required" variant of the same card on other tabs, and the amber banner at the top of the page is untouched.

## Technical outline

- `src/pages/applications/ApplicationDetail.tsx`: the applicant resubmit card block (currently gated on `isOwner && (resubmission_requested | query_raised | info_requested)`) gets an additional condition `activeTab !== 'form'`. Presentation-only change — no logic, status, or data changes.

## Verification

- Open an application in `info_requested` state as the applicant, switch to Submitted Forms and confirm the card is gone; switch to Details/RFI and confirm the card and Resubmit button are still present and working.
