## Option A: new registration linked to Rodney Bay

This plan only. Nothing will run until you approve it.

### Duplicate-prevention findings (read-only, confirmed)

**1. The registration number will not match automatically.**
- Automatic exact matching uses only two things:
  - identifiers recorded against the entity
  - a licence number
- Rodney Bay (`cc331…`) has **0 recorded identifiers** and **0 licences**.
- The registration form's "registration number" field is saved, but it is **not used for matching**.
- So `CU-RB-2026-014` cannot give an exact match.

**2. The legal name will produce a "possible match".**
- The exact name "Rodney Bay Community Credit Union Ltd" scores 80 against `cc331…`.
- That opens an **Entity Resolution case** for a regulator to decide.
- The registration stays "pending resolution", with **no entity created**.

**3. A provisional entity is only created when nothing scores at all.**
- That happens only if no existing name matches.
- Typing the exact legal name prevents it. Even a partial name, such as one without "Ltd", still gives a possible match.

**4. Other Rodney Bay names exist**, for example "Rodney Bay Payments Ltd" and "Rodney Bay Fund Administrators". They may appear as extra candidates. The reviewer must pick `cc331…` only.

**5. Resolving the case binds the registration to the existing entity.** It does **not** grant membership. Membership comes from the later approval step.

**6. Other duplicate checks**
- A new email is required. `rodneybay.registration@yopmail.com` has no account today.
- The applicant name is unique: no registration uses "Rodney Bay…" today.

### Not yet proven (will check before the step it affects)
- That approving the registration creates the hand-off and a membership on the bound entity `cc331…`. The rule that blocked you needs the hand-off.
- That the Credit Union form appears for the new user. The fix made earlier should cover this.

### Stop conditions
Stop and report if any of these happen:
- the outcome after submission is "provisional entity created", or anything other than a possible-match case
- the case lists no candidate `cc331…`
- the reviewer screen offers only "confirm new entity"
- approval does not bind to `cc331…`, or creates a second entity
