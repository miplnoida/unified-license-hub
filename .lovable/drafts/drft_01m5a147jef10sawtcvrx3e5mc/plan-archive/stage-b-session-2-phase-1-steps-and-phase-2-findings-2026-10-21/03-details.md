## Phase 2: findings and proposals (plan only, nothing changed)

### 1. Credit Union fee
- **What exists today:** fees are set per sector or sub-sector. Examples:
  - MSB Fee, 150.00 XCD
  - Change of Address, 100.00 XCD
  - Change of Control, 200.00 XCD

  All are "Application Fee", fixed amount, in XCD. Credit Unions has none.
- **Payment rule:** the final submission check requires a completed payment, even when the fee is zero. There is no exemption path.
- **Proposal:** add one "Application Fee" for Credit Unions → Credit Union, fixed, in XCD, entered in Fee Management by an authorised admin. **You set the amount;** I won't pick one. Payment then goes through the existing gateway simulator.
- **Change needed:** 1 new fee setting. Nothing else changes.

### 2. Approval workflow
- **What exists today:** two licence workflows are active, labelled "general" and "Insurance". The label must match exactly, so Credit Union applications match neither.
- **Proposal:** a new "Credit Union Pre-License Approval" workflow scoped to Credit Unions → Credit Union, created in Workflow Management. Three levels:
  1. Licensing Officer: intake and completeness
  2. Fit & Proper Officer: director assessments
  3. Licensing Supervisor: final decision, a different person from level 1
- **Change needed:** 1 workflow and 3 steps. The existing workflows stay unchanged.

### 3. Failed certificate and portal-access tasks
- **What exists today:** 32 failed tasks (16 certificate and 16 portal access), each tried 8 times, created between 29 Aug and 20 Oct.
- **Key finding:** **none of them carries a licence ID**. The certificate generator needs one, so these tasks fail every time.
- **Likely cause:** the task is queued before the licence exists, or without its ID. I'll confirm this read-only from the function logs.
- **Effect on Rodney Bay:** probably the same failure when its licence is issued, unless that cause is fixed. If so, a code fix will be proposed separately.

## Phase 1 verification
- Every new record points to `cc331…`:
  - the registration
  - the resolution decision
  - the membership
  - the draft application
  - the documents
- No second Rodney Bay entity.
- No self-approval.
- Audit entries exist.
- The other credit unions' fingerprint is unchanged.
- Fee, workflow and form counts are unchanged.
- Entity 360 still says "No licences recorded".

## Restrictions
- No direct inserts.
- No changes to code, schema, fees, workflows or security settings.
- The OTP step is never bypassed.
- I stop and report if anything unexpected happens.
