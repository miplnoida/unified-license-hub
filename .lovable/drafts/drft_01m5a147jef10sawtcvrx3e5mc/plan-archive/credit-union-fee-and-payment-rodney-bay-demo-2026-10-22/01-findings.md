# Credit Union fee and payment — Rodney Bay demo

## What I found (read-only)
- **Payment for other sectors:** the application's Payment & Submit step uses the platform's built-in payment simulation. All 31 existing payments are "online" or "simulated" and completed. No real card provider is connected, so no real charge can happen. The server checks for a completed payment before it accepts a submission. This is the supported test path.
- **How fees are chosen:** the system looks for a fee set for that one application first. Only if there is none does it use the sector-wide fee schedule (sector, sub-sector, category, form).
- **Sector-wide fee cannot be limited to Rodney Bay.** A Credit Union fee in Fee Management would apply to every Credit Union pre-licence applicant. One other applicant already has a Credit Union draft, APP-2026-000163, and would be charged too. **So I will not create a sector-wide fee.**
- **Fee limited to the demo:** licensing staff can add a fee to one application from that application's page (fee breakdown panel). It affects only that application, and the server uses it first. No fee configuration changes.
- **Hard blocker first:** no Rodney Bay applicant can create a draft application yet. The approved registration hand-off is missing, and `rbc_primary_user` has no registration. Without a draft there is nothing to attach a fee to or pay for.
- **Without a workflow:** submission still succeeds, but the application waits for manual processing instead of moving through an approval chain. The workflow stays on hold, as you asked.
