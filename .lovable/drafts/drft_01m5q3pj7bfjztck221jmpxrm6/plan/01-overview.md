## Fix registration REG-2026-000204 (Rodney Bay) only

## What I found
- **The approval is stuck.** The registration was approved on 22 Oct at 05:54 UTC, but its approval workflow never moved forward. The workflow still shows "Initial Step" as in progress, and no reviewer actions were ever recorded. When you try to approve, the system refuses because the registration is already approved. The other 6 approved registrations all have a completed workflow. This is the only one left open.
- **The addresses are stored in the wrong format.** Each address is saved as a single line of text ("Rodney Bay Commercial Centre, Gros Islet, Saint Lucia") instead of as separate address fields. The review page splits that text into one row per character (0: R, 1: o, ...). That is the "index and letter" display you are seeing.

## What I'll change (this registration only)
1. **Close the stuck workflow.** Mark it completed, using the registration's approval time of 22 Oct 05:54 UTC. The approval stays as it is. I won't invent reviewer actions, sign-offs or extra approvals, and nothing is re-approved.
2. **Store both addresses as separate fields:**
   - Street: Rodney Bay Commercial Centre, Rodney Bay
   - City: Gros Islet
   - District: Gros Islet Quarter
   - Country: Saint Lucia
   - Post code: LC01 101

   Physical address is the same as the mailing address.
3. **Check the result.** Confirm the review page shows normal address rows and no longer offers final approval, and that nothing else on the registration changed.

## Not changed
No code, workflow setup, other registrations, application APP-2026-002011, licence, payments, users or permissions. The addresses are believable demo values I made up. Tell me if you want the real ones.

## Technical
Two single-row updates. `workflow_instances` id `54db301e-...`: set `status='completed'` and `completed_at` to the registration's approval time. `registrations` id `8a319e2d-...`: set `mailing_address` and `physical_address` to JSON objects using the existing keys (`street`, `city`, `state`, `country`, `postCode`). Both updates are guarded by id and current value.
