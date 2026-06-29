## Goal

When a licensee renews, the renewal flow should use the **same form templates and pre-fill the same field values** as the originally approved license application. Any field whose current value differs from the original is highlighted yellow with a "Changed" badge — both for the applicant while editing and for internal reviewers viewing the submitted renewal.

All existing non-renewal logic (new applications, post-license services other than renew, drafts, payments, documents, workflow, AI assessment, resubmission, route guards) stays untouched.

---

## Scope

### 1. Renewal creation — `src/pages/licenses/LicenseDetail.tsx` (`startRenewal`)

Today this resolves a single dedicated "Renewal" form template and writes only that template id into the new application. Change it so that:

- Look up the **original approved application** for this license:
  - First by `licenses.application_id` if present.
  - Fallback: query `applications` where `data->>'license_id'` (or matching license number / applicant + sector) corresponds to this license, `status = 'approved'`, most recent.
- Read `form_template_ids`, `forms_data`, and `form_version_ids` from that application's `data` JSON.
- Persist on the new renewal application's `data`:
  - `form_template_ids`: copied from original (NOT the standalone renewal template).
  - `forms_data`: copied from original (becomes the prefilled current values).
  - `form_version_ids`: copied from original.
  - `original_application_id`: id of the source application.
  - `original_forms_data`: deep copy of the original `forms_data` (immutable snapshot for diffing).
  - `original_form_version_ids`: copy of source version ids.
  - Keep existing `renewal_of_license_id`, `is_renewal`, `service: 'Renew'`, computed `valid_until`, and `service_id` logic — fee + workflow resolution is unchanged.
- If no original application can be located (legacy licenses), fall back to today's behavior: use the resolved renewal template with empty data, no snapshot, no highlighting. Surface a small "original application data not available" note (still allows renewal).

### 2. Applicant renewal editor — `src/pages/PostLicenseApplicationForms.tsx`

- Detect renewal mode from `appData.data.is_renewal === true` and presence of `original_forms_data`.
- Pass `originalData={originalFormsData[templateId] || {}}` into `<ActiveFormFiller>` → `<FormRenderer>`.
- Add a legend banner above the form list and inside the active form view: *"Yellow fields were changed from the original approved application."* (Only when renewal + snapshot exist.)

### 3. FormRenderer diff highlighting — `src/components/form-renderer/FormRenderer.tsx`

- New optional prop: `originalData?: Record<string, any>`.
- Helper `isFieldChanged(fieldName, currentValue, originalValue)` using a deep-equal compare (normalize `undefined`/`null`/`''` as equivalent empty; arrays compared by stable JSON; objects recursively; trims strings). Reuse for repeatable/group fields by comparing the array entry as a whole.
- Wrap each rendered field container (the existing field wrapper that hosts label + input) with conditional classes when changed:
  - `border border-yellow-400 bg-yellow-50 rounded-md p-2`
  - Append a `<Badge variant="outline" className="text-yellow-700 border-yellow-400">Changed</Badge>` next to the label.
- Applies to all input types currently rendered (text, number, decimal, email, phone, date, textarea, select, multi_select, radio, checkbox, file, table rows, repeatable sections). For tables/repeatables the whole row/entry is highlighted when its serialized value differs.
- Live: because `data` state already updates per keystroke, highlight recomputes automatically; reverting restores the original style.
- When `originalData` is not provided, behavior is identical to today (no visual change, no perf cost beyond a cheap undefined check).

### 4. Internal reviewer view — `src/components/applications/SubmittedForms.tsx` + `src/pages/applications/ApplicationDetail.tsx`

- `ApplicationDetail` already reads `appData.forms_data`. Also read `appData.original_forms_data` and `appData.is_renewal`, pass as new props `originalFormsData` and `isRenewal` to `<SubmittedForms>`.
- `SubmittedForms` / `SingleFormViewer` accept `originalFormsData` and forward `originalData={originalFormsData?.[templateId] || {}}` into `<FormRenderer readOnly />`.
- Read-only mode already disables inputs; the same yellow wrapper + "Changed" badge still renders, giving the reviewer the same visual diff.
- Show the legend banner above the forms when renewal + snapshot are present. Leave all surrounding tabs (Workflow, AI Assessment, Activity, Documents, Fees, Decision Summary) untouched.

### 5. Backward compatibility

- Legacy renewals already in flight (no `original_forms_data`): renewal form opens, no highlighting, no legend, no errors. Same as today.
- Non-renewal applications: no `originalData` prop, no diff UI, behavior identical.
- The new fields on `applications.data` are JSONB additions — no migration required.

---

## Files to change

```text
src/pages/licenses/LicenseDetail.tsx         # fetch original app, snapshot into renewal
src/pages/PostLicenseApplicationForms.tsx    # pass originalData + legend
src/components/form-renderer/FormRenderer.tsx # originalData prop + diff highlight + Changed badge
src/components/applications/SubmittedForms.tsx # accept + forward originalFormsData
src/pages/applications/ApplicationDetail.tsx  # read original_forms_data, pass through
src/lib/formDiff.ts                          # new: deepEqualField helper
```

No DB migration, no edge function changes, no route changes, no permission changes.

---

## Verification

Once built I will:
1. Open a license with an approved original application → click Renew → confirm the renewal form lists the same templates with original answers prefilled. Edit a field → yellow + "Changed" badge appears; revert → highlight disappears.
2. Save draft, reopen — highlight state persists based on stored data vs snapshot.
3. Submit renewal → open `/applications/:id` as internal user → "Submitted Forms" tab shows the same diff with yellow + "Changed" badges, read-only.
4. Renew a license with no resolvable original application → renewal still opens with the legacy renewal template, no legend, no errors.
5. Open a normal (non-renewal) draft and submitted application → no visual change vs today.