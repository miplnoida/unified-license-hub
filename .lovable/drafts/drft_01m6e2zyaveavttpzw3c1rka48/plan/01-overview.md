## Push LIC-2026-000034 past its grace period

### Why renewal is still blocked
- No grace period has been set up for Commercial Bank licences. The only rule in Settings is for a different sector, and there is no default.
- When nothing is set, the licence screens assume **30 days** of grace. Ending on 1 Nov, the licence is in grace until 1 Dec, so the Renew button stays hidden.
- The server check uses **0 days** for the same missing setting. The two disagree. That is a separate problem and this plan does not change it.

### What I will change (test data only, one licence)
- Move "Valid until" on LIC-2026-000034 to **15 Sep 2026**. That is more than 30 days before today, so the grace period has ended under both checks.
- Status stays `expired`.
- To restore it later: set it to active, valid until 2027-08-24 13:13:44 UTC.

This writes straight to the live shared database.

### Afterwards
- Read the licence back to confirm the new date.
- You test Renew as the licence holder.

### Optional follow-up (not included)
Make the screens and the server use the same grace period when none is set, for example 0 days or a real default saved in Settings. Tell me which you want.
