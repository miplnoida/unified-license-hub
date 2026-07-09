## Scope

Fix dashboard tiles across three audiences: internal Supervisory, Licensee/PPOC, and Applicant/Pre-Licensee. Two problem classes:

1. **Wrong counts** — a tile shows 0 while the underlying table has rows.
2. **Broken click-through filters** — clicking a card lands on the list page but the filter isn't applied.

No workflow, RLS, or business-logic changes. Only metric queries, dashboard wiring, and list-page filter parsing.

---

## Confirmed bugs

### A. Applicant / Pre-Licensee dashboard (`ApplicantDashboard.tsx` + `useApplicantMetrics.ts`)

1. `scopeApps` for `scope='pre'` uses `q.is('data->>service_id', null).neq('data->>type', 'post_license')`. In PostgREST, `.neq` **excludes rows where the field is NULL**, so pre-license applications (which have no `data.type` key) get filtered out → drafts/submitted counts come back as 0.
2. Metric cards for `Submitted`, `Under review`, `Approved`, `Action required` all link to `appsListPath` without a `?status=` param → click doesn't filter.
3. "Pending payments" tile always links to `/billing/pre-licensee` even for post-license applicants.

### B. Supervisory dashboard (`SupervisoryDashboard.tsx`)

1. `Licences by status` breakdown items (`Active / Expiring / Expired / Suspended / Revoked`) have no `to` → clicks do nothing.
2. `Payments` breakdown (`Pending / Paid / Failed`), `Inspections`, `Enforcement`, `Complaints`, `Risk` breakdowns — same: no `to`.
3. `High-Risk Entities` and `Open Enforcement` metric tiles — no `to`.
4. Active-licenses count reportedly renders 0 while DB has 2 rows. Root cause: `useSupervisoryMetrics` uses `head:true` on `licenses` without any user-facing error surfacing; if the caller is scoped to an `activeRegulatorId`/`activeSectorId` that doesn't match the seeded license rows, count returns 0. Currently the hook silently swallows filter mismatches with no diagnostic.

### C. Licensee dashboard (`useLicenseeMetrics.ts` + `LicenseeDashboard.tsx`)

Metric cards and breakdowns are wired to `licenseeDrilldownTo(...)`, but a subset of drill-down URLs (`appsDraft`, `appsSubmitted`, `paymentsPending`, etc.) don't propagate the `licenseeId` context, so target list pages fall back to unscoped RPCs and show empty lists when accessed via PPOC.

---

## Fix plan

### 1. `src/hooks/useApplicantMetrics.ts`
- Rewrite `scopeApps('pre')` to correctly include NULLs on `data->>type`. Use `.or('data->>type.is.null,data->>type.neq.post_license')` combined with `.is('data->>service_id', null)`.
- Add an `if (import.meta.env.DEV)` log when any count query returns an error so future regressions surface.

### 2. `src/components/dashboard/ApplicantDashboard.tsx`
- Compute per-card links:
  - Submitted → `${appsListPath}${appsListPath.includes('?') ? '&' : '?'}status=submitted`
  - Under review → `...status=under_review`
  - Approved → `...status=approved`
  - Action required → `...status=action_required`
- Pending payments tile: `to={portalCtx.isPreLicensee ? '/billing/pre-licensee' : '/payments?status=pending'}`.

### 3. `src/components/dashboard/SupervisoryDashboard.tsx`
- Add `to` entries to every `StatusBreakdownCard` item using existing `drilldownTo(...)` helper (extend `dashboardDrilldowns.ts` with any missing keys: `licensesActive`, `licensesExpiring`, `licensesExpired`, `licensesSuspended`, `licensesRevoked`, `paymentsPending`, `paymentsPaid`, `paymentsFailed`, `complaintsOpen`, `complaintsInvestigating`, `complaintsResolved`, `inspectionsScheduled`, `inspectionsInProgress`, `enforcementOpen`, `enforcementClosed`, `riskHigh`, `riskMedium`, `riskLow`).
- Add `to` on `High-Risk Entities` and `Open Enforcement` metric cards.

### 4. `src/hooks/useSupervisoryMetrics.ts`
- Log query errors in DEV so the "0 active licenses" case surfaces its real cause (filter mismatch vs RLS).
- Where a filter param (`activeRegulatorId`, `activeSectorId`) is provided but empty string, coerce to null so we don't apply a `.eq('regulator_id', '')` that returns 0.

### 5. `src/lib/dashboardDrilldowns.ts` and `src/lib/licenseeDashboardDrilldowns.ts`
- Add the missing drill-down keys listed above.
- For licensee drill-downs, ensure `licenseeId` is appended when known so post-navigation list pages stay scoped.

### 6. List-page filter parsing (verify + minor fixes only)
- `PaymentHistory.tsx` already parses `?status=`. No change unless target key mismatches.
- `LicensesList.tsx`: accept `?status=active|expired|suspended|revoked` in addition to `?filter=expiring`. Currently ignores `status` when `filter` is absent.
- `ApplicationsList.tsx`: accept `?status=action_required` and expand to the RFI/resubmission status set at query time.

---

## Out of scope (per user)

- No workflow/RLS changes.
- No new tables/columns.
- No visual/design changes beyond adding `to` links.

## Verification

- Log in as super admin → dashboard → click each breakdown item → confirm target list page shows filtered rows matching the count.
- Log in as licensee (PPOC and primary) → repeat.
- Log in as pre-license applicant with a draft → confirm Drafts tile shows the correct count (previously 0).
