# Pre-licensee menu and page access audit

Pre-licensee accounts should see only what belongs to their registration and pre-licence journey. Whatever rule hides a menu item will also govern typing its address directly. When a page is refused, the user gets a clear message instead of being sent back to the dashboard without explanation.

## What I checked
- **Menu:** The sidebar comes from 16 menu entries marked "external" or "any" in the database. All of them are offered to pre-licensees and then trimmed by on-screen rules.
- **The account:** rodneybay.registration@yopmail.com holds the Applicant and Pre-licensee roles and has **no approved institution membership**. The My Institution data lookup refuses accounts that aren't members, so this account has no legitimate My Institution view.
- **Why pages bounce:** An approved pre-licensee can only open pages on a fixed list of allowed addresses. Anything else is sent to `/dashboard` with no message. My Institution, My Correspondence, Help & User Manual and Support are missing from that list.

## Eligibility matrix (pre-licensee with no licensee entitlement)

| Menu | Address | Today | Should be | Cause / change |
|---|---|---|---|---|
| Home | /dashboard | Shown, opens | Show | None |
| Notifications | /notifications | Shown, opens | Show | None |
| Help & User Manual | /help/user-manual | Shown, **bounces** | Show | Not on allowed list; add `/help` |
| Help & Support | /support | Shown, **bounces** | Show | Not on allowed list; add `/support` |
| My Correspondence | /entity/correspondence (+ `/:id`) | Shown, **bounces** | Show; only threads the backend already allows | Not on allowed list; add it |
| My Institution | /entity/profile | Shown, **bounces** | Hide unless approved member; direct link shows "no institution" message | Menu ignores membership; not on allowed list |
| My Licences | /licenses | Shown, opens | Show | Existing rule (licence from own application) |
| Pre-Licensing | /applications?type=pre | Shown, opens | Show | None |
| My Appeals | /appeals | Shown, opens | Show | None |
| My Payments | /payments | Shown, opens | Show | None |
| Documents | /documents | Shown, opens (no account gate) | Show (own application documents) | Route skips the gate; add the standard gate and allowed-list entry |
| Post-Licensing | /applications?type=post, /post-license* | Hidden; direct link shows notice | Hidden + notice | Already correct |
| My Returns / Reporting Dashboard | /entity/returns* | Hidden; direct link shows notice | Hidden + notice | Already correct |
| Information Requests | /entity/complaint-rfis | **Shown, opens** | Hide + notice | Licensed-institution feature; route has no gate |
| Supervisory Actions | /entity/supervisory-actions | **Shown, opens** | Hide + notice | Licensed-institution feature; route has no gate |

Behaviour I couldn't confirm yet and will check on screen: whether Documents and the two ungated pages currently show any data to this account.

## What stays the same
- Licensee, staff, regulator and admin menus and pages are unchanged.
- Rows are still filtered by the backend's existing access rules. There are no database, permission or role changes, and no user- or entity-specific conditions.
- A pre-licensee who also has a real licensee entitlement (licensee role, approved Primary/Secondary association or contact-person mapping) keeps the licensed features. The same shared rule decides this everywhere.
