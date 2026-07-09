## Plan to fix internal complaint submission

### Findings
- The internal complaint insert policy exists, and the helper currently recognizes known internal users.
- The same user-facing error may still appear because the insert chain has multiple blockers:
  - `customer_type` is constrained and cannot be blank.
  - `priority` must be one of `p1`, `p2`, `p3`, `p4`.
  - The internal insert policy only checks role tables, while the app can identify internal users through profile role/user type as well.
  - A successful insert may still fail immediately after insert if the app cannot read the newly inserted complaint due to restrictive SELECT policies.

### Changes to implement
1. **Harden the backend internal-staff helper**
   - Extend `public.is_internal_staff(user_id)` to treat users as internal if any of these are true:
     - assigned internal role in `user_roles`
     - internal dynamic role
     - profile role is an internal role
     - profile `user_type = 'employee'`
   - Keep external users restricted by existing external complaint capability checks.

2. **Fix read-after-insert for internal users**
   - Update the complaint SELECT policy so all internal staff can read complaints they create or administer.
   - This prevents `.insert(...).select('*').single()` from surfacing as a submission failure after the row is created.

3. **Normalize the complaint form payload**
   - Ensure internal complaint form defaults to valid `priority = 'p3'`.
   - Convert blank optional constrained fields to `null`, especially `customer_type`, `email`, and vulnerability notes.
   - Keep the UI customer type options aligned with the database constraint.

4. **Improve error visibility**
   - Preserve the backend error code/details in the thrown error or console warning so future failures distinguish RLS from constraint failures.

5. **Verify**
   - Re-run a real internal-user insert simulation against the live backend.
   - Confirm the insert returns the created complaint record.
   - Remove any temporary verification row created during testing.

### Expected result
Internal staff users can submit `/complaints/new-internal` without the RLS error, while external complaint access rules remain enforced.