// Deterministic data-integrity checks for a licensing application.
//
// These are computed in code (never by the model) so the AI interprets real
// facts. Each check returns a status plus the exact values involved, so the
// analyst can verify every line against the record.
//
// Statuses: pass | warning | fail | not_applicable

export type IntegrityStatus = "pass" | "warning" | "fail" | "not_applicable";

export interface IntegrityCheck {
  key: string;
  label: string;
  group:
    | "fees_payment"
    | "cross_form_consistency"
    | "arithmetic"
    | "date_logic"
    | "completeness"
    | "lifecycle";
  status: IntegrityStatus;
  detail: string;
  values?: Array<{ label: string; value: string }>;
}

export interface DataIntegritySnapshot {
  computed_at: string;
  counts: { pass: number; warning: number; fail: number; not_applicable: number };
  checks: IntegrityCheck[];
}

type Json = Record<string, unknown>;

const PLACEHOLDERS = new Set([
  "na",
  "n/a",
  "n.a.",
  "nil",
  "none",
  "-",
  "--",
  "tbd",
  "to be decided",
  "xxx",
  "test",
  "abc",
  "asdf",
]);

const BUSINESS_KEY_HINTS = [
  "name",
  "entity",
  "company",
  "incorporat",
  "registration_number",
  "registration_no",
  "trn",
  "tin",
  "capital",
  "paid_up",
  "share",
  "ownership",
  "percent",
  "address",
  "email",
  "phone",
  "mobile",
  "contact",
  "country",
  "currency",
  "director",
  "turnover",
  "revenue",
];

function isPlainObject(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function humanKey(key: string): string {
  const leaf = key.split(".").pop() || key;
  return leaf
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Flatten nested response data into dotted leaf paths. */
function flatten(value: unknown, prefix = "", out: Array<{ path: string; value: unknown }> = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out.push({ path: prefix, value });
  return out;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "").replace(/[^0-9.-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v) && !/^\d{2}[/-]\d{2}[/-]\d{4}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface IntegrityInput {
  application: {
    id: string;
    status?: string | null;
    submitted_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    data?: Json | null;
  };
  submittedForms: Array<{
    id?: unknown;
    template_name?: string | null;
    status?: unknown;
    submitted_at?: unknown;
    response_data?: unknown;
  }>;
  documents: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  expectedFeeTotal: number | null;
  expectedFeeCurrency: string | null;
  rfiRequests: Array<Record<string, unknown>>;
  rfiResponses: Array<Record<string, unknown>>;
  formDataUpdatedAt: string | null;
}

export function computeDataIntegrity(input: IntegrityInput): DataIntegritySnapshot {
  const checks: IntegrityCheck[] = [];
  const add = (c: IntegrityCheck) => checks.push(c);

  const appData = (input.application.data as Json) || {};
  const submittedAt = input.application.submitted_at
    ? new Date(input.application.submitted_at)
    : null;

  /* ------------------------------- fees ---------------------------------- */
  const paidRows = input.payments.filter((p) =>
    ["completed", "success", "paid", "captured"].includes(String(p.status || "").toLowerCase()),
  );
  const paidTotal = paidRows.reduce((s, p) => s + (toNumber(p.amount) ?? 0), 0);
  const paidCurrencies = Array.from(
    new Set(paidRows.map((p) => String(p.currency || "").toUpperCase()).filter(Boolean)),
  );
  const expected = input.expectedFeeTotal;

  if (input.payments.length === 0) {
    add({
      key: "payment_present",
      label: "Fee payment recorded",
      group: "fees_payment",
      status: "fail",
      detail: "No payment record exists against this application.",
    });
  } else if (paidRows.length === 0) {
    add({
      key: "payment_present",
      label: "Fee payment recorded",
      group: "fees_payment",
      status: "fail",
      detail: `${input.payments.length} payment record(s) exist but none has a completed status.`,
      values: input.payments.map((p) => ({
        label: `Payment ${asText(p.id).slice(0, 8)}`,
        value: `${asText(p.amount)} ${asText(p.currency)} — ${asText(p.status)}`,
      })),
    });
  } else if (expected === null) {
    add({
      key: "fee_vs_payment",
      label: "Paid amount vs applicable fee",
      group: "fees_payment",
      status: "not_applicable",
      detail: `Paid ${paidTotal} ${paidCurrencies.join("/") || ""}. No applicable fee configuration was found to compare against.`,
      values: [{ label: "Paid total", value: `${paidTotal} ${paidCurrencies.join("/")}` }],
    });
  } else {
    const diff = Number((paidTotal - expected).toFixed(2));
    const status: IntegrityStatus = diff === 0 ? "pass" : diff < 0 ? "fail" : "warning";
    add({
      key: "fee_vs_payment",
      label: "Paid amount vs applicable fee",
      group: "fees_payment",
      status,
      detail:
        diff === 0
          ? "Paid amount matches the applicable fee."
          : diff < 0
            ? `Underpaid by ${Math.abs(diff)}.`
            : `Overpaid by ${diff}.`,
      values: [
        { label: "Applicable fee", value: `${expected} ${input.expectedFeeCurrency || ""}`.trim() },
        { label: "Paid total", value: `${paidTotal} ${paidCurrencies.join("/")}`.trim() },
      ],
    });
  }

  if (paidRows.length && input.expectedFeeCurrency && paidCurrencies.length) {
    const mismatch = paidCurrencies.filter(
      (c) => c !== String(input.expectedFeeCurrency).toUpperCase(),
    );
    if (mismatch.length) {
      add({
        key: "fee_currency",
        label: "Payment currency vs fee currency",
        group: "fees_payment",
        status: "warning",
        detail: `Payment currency ${mismatch.join(", ")} differs from the fee currency ${input.expectedFeeCurrency}.`,
      });
    }
  }

  /* --------------------- cross-form consistency -------------------------- */
  const byKey = new Map<string, Map<string, string[]>>(); // leafKey -> value -> forms
  input.submittedForms.forEach((f, idx) => {
    const formLabel = String(f.template_name || `Form ${idx + 1}`);
    for (const { path, value } of flatten(f.response_data)) {
      const leaf = (path.split(".").pop() || path).replace(/\[\d+\]/g, "");
      if (!BUSINESS_KEY_HINTS.some((h) => leaf.toLowerCase().includes(h))) continue;
      const text = asText(value).trim();
      if (!text) continue;
      const norm = text.toLowerCase().replace(/\s+/g, " ");
      if (!byKey.has(leaf)) byKey.set(leaf, new Map());
      const vals = byKey.get(leaf)!;
      if (!vals.has(norm)) vals.set(norm, []);
      if (!vals.get(norm)!.includes(formLabel)) vals.get(norm)!.push(formLabel);
      // keep original casing for display via a sentinel entry
      if (!vals.get(norm)!.includes(`::${text}`)) vals.get(norm)!.push(`::${text}`);
    }
  });

  const conflicts: IntegrityCheck["values"] = [];
  for (const [leaf, vals] of byKey) {
    if (vals.size < 2) continue;
    const display = Array.from(vals.entries()).map(([, tags]) => {
      const raw = tags.find((t) => t.startsWith("::"))?.slice(2) ?? "";
      const forms = tags.filter((t) => !t.startsWith("::"));
      return `${raw} (${forms.join(", ")})`;
    });
    conflicts.push({ label: humanKey(leaf), value: display.join(" vs ") });
  }
  if (input.submittedForms.length < 2) {
    add({
      key: "cross_form_consistency",
      label: "Same fact declared consistently across forms",
      group: "cross_form_consistency",
      status: "not_applicable",
      detail: "Fewer than two submitted forms — no cross-form comparison possible.",
    });
  } else if (conflicts.length === 0) {
    add({
      key: "cross_form_consistency",
      label: "Same fact declared consistently across forms",
      group: "cross_form_consistency",
      status: "pass",
      detail: "No conflicting business values were found across the submitted forms.",
    });
  } else {
    add({
      key: "cross_form_consistency",
      label: "Same fact declared consistently across forms",
      group: "cross_form_consistency",
      status: "fail",
      detail: `${conflicts.length} business value(s) are declared differently across forms.`,
      values: conflicts.slice(0, 15),
    });
  }

  /* ----------------------------- arithmetic ------------------------------ */
  const ownershipIssues: IntegrityCheck["values"] = [];
  const scanOwnership = (label: string, data: unknown) => {
    if (!isPlainObject(data) && !Array.isArray(data)) return;
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        const pcts = node
          .map((item) => {
            if (!isPlainObject(item)) return null;
            const entry = Object.entries(item).find(([k]) =>
              /percent|shareholding|holding|ownership/i.test(k),
            );
            return entry ? toNumber(entry[1]) : null;
          })
          .filter((n): n is number => n !== null);
        if (pcts.length >= 2) {
          const sum = Number(pcts.reduce((a, b) => a + b, 0).toFixed(2));
          if (Math.abs(sum - 100) > 0.5) {
            ownershipIssues.push({
              label: `${label} — ${humanKey(path)}`,
              value: `shares total ${sum}% across ${pcts.length} holders (expected 100%)`,
            });
          }
        }
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      if (isPlainObject(node)) {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(data, "");
  };
  input.submittedForms.forEach((f, idx) =>
    scanOwnership(String(f.template_name || `Form ${idx + 1}`), f.response_data),
  );

  const totalIssues: IntegrityCheck["values"] = [];
  const scanTotals = (label: string, data: unknown) => {
    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!isPlainObject(node)) return;
      for (const [k, v] of Object.entries(node)) {
        const declared = toNumber(v);
        if (declared !== null && /^(total|sum|grand_total|net_total)/i.test(k)) {
          const base = k.replace(/^(total|sum|grand_total|net_total)_?/i, "");
          const siblingArray = Object.entries(node).find(
            ([sk, sv]) => Array.isArray(sv) && (base ? sk.toLowerCase().includes(base.toLowerCase()) : true),
          );
          if (siblingArray && Array.isArray(siblingArray[1])) {
            const nums = (siblingArray[1] as unknown[])
              .map((item) => {
                if (!isPlainObject(item)) return toNumber(item);
                const entry = Object.entries(item).find(([ik]) =>
                  /amount|value|total|balance|qty|quantity/i.test(ik),
                );
                return entry ? toNumber(entry[1]) : null;
              })
              .filter((n): n is number => n !== null);
            if (nums.length) {
              const sum = Number(nums.reduce((a, b) => a + b, 0).toFixed(2));
              if (Math.abs(sum - declared) > 0.01) {
                totalIssues.push({
                  label: `${label} — ${humanKey(k)}`,
                  value: `declared ${declared} but components add to ${sum}`,
                });
              }
            }
          }
        }
        walk(v);
      }
    };
    walk(data);
  };
  input.submittedForms.forEach((f, idx) =>
    scanTotals(String(f.template_name || `Form ${idx + 1}`), f.response_data),
  );

  const arithmeticIssues = [...ownershipIssues, ...totalIssues];
  add({
    key: "arithmetic_integrity",
    label: "Totals and percentages reconcile",
    group: "arithmetic",
    status: input.submittedForms.length === 0 ? "not_applicable" : arithmeticIssues.length ? "fail" : "pass",
    detail:
      input.submittedForms.length === 0
        ? "No submitted forms to reconcile."
        : arithmeticIssues.length
          ? `${arithmeticIssues.length} figure(s) do not reconcile with their components.`
          : "Declared totals and ownership percentages reconcile with their components.",
    values: arithmeticIssues.slice(0, 15),
  });

  /* ----------------------------- date logic ------------------------------ */
  const dateIssues: IntegrityCheck["values"] = [];
  const now = new Date();
  const allDates: Array<{ label: string; path: string; date: Date }> = [];
  const collectDates = (label: string, data: unknown) => {
    for (const { path, value } of flatten(data)) {
      const leaf = (path.split(".").pop() || path).toLowerCase();
      if (!/date|dob|from|to|since|until|issued|expiry|expires/.test(leaf)) continue;
      const d = parseDate(value);
      if (d) allDates.push({ label, path, date: d });
    }
  };
  input.submittedForms.forEach((f, idx) =>
    collectDates(String(f.template_name || `Form ${idx + 1}`), f.response_data),
  );
  collectDates("Application data", appData);

  for (const d of allDates) {
    const leaf = (d.path.split(".").pop() || "").toLowerCase();
    const forwardLooking = /expiry|expires|valid|renewal|due|maturity|end|to$/.test(leaf);
    if (!forwardLooking && d.date.getTime() > now.getTime()) {
      dateIssues.push({
        label: `${d.label} — ${humanKey(d.path)}`,
        value: `future-dated ${fmtDate(d.date)}`,
      });
    }
    if (submittedAt && /incorporat|establish|registration_date|commence/.test(leaf)) {
      if (d.date.getTime() > submittedAt.getTime()) {
        dateIssues.push({
          label: `${d.label} — ${humanKey(d.path)}`,
          value: `${fmtDate(d.date)} is after the submission date ${fmtDate(submittedAt)}`,
        });
      }
    }
  }
  // issue/expiry pairs within the same object path prefix
  const byPrefix = new Map<string, { issued?: Date; expiry?: Date; label: string }>();
  for (const d of allDates) {
    const leaf = (d.path.split(".").pop() || "").toLowerCase();
    const prefix = `${d.label}|${d.path.split(".").slice(0, -1).join(".")}`;
    const cur = byPrefix.get(prefix) || { label: d.label };
    if (/issue|issued|from|start|effective/.test(leaf)) cur.issued = d.date;
    if (/expiry|expires|valid_to|end|to$/.test(leaf)) cur.expiry = d.date;
    byPrefix.set(prefix, cur);
  }
  for (const [prefix, pair] of byPrefix) {
    if (pair.issued && pair.expiry && pair.expiry.getTime() < pair.issued.getTime()) {
      dateIssues.push({
        label: prefix.split("|")[0],
        value: `end date ${fmtDate(pair.expiry)} falls before start date ${fmtDate(pair.issued)}`,
      });
    }
  }

  add({
    key: "date_logic",
    label: "Dates are logically ordered",
    group: "date_logic",
    status: allDates.length === 0 ? "not_applicable" : dateIssues.length ? "fail" : "pass",
    detail:
      allDates.length === 0
        ? "No dates were found in the submitted data."
        : dateIssues.length
          ? `${dateIssues.length} date value(s) are out of sequence or impossible.`
          : `All ${allDates.length} date value(s) are logically ordered.`,
    values: dateIssues.slice(0, 15),
  });

  /* ---------------------------- completeness ----------------------------- */
  const blanks: IntegrityCheck["values"] = [];
  const placeholders: IntegrityCheck["values"] = [];
  input.submittedForms.forEach((f, idx) => {
    const label = String(f.template_name || `Form ${idx + 1}`);
    for (const { path, value } of flatten(f.response_data)) {
      const text = asText(value).trim();
      if (!text) {
        blanks.push({ label, value: humanKey(path) });
        continue;
      }
      if (PLACEHOLDERS.has(text.toLowerCase())) {
        placeholders.push({ label: `${label} — ${humanKey(path)}`, value: text });
      }
    }
  });

  add({
    key: "field_completeness",
    label: "Declared fields carry real values",
    group: "completeness",
    status:
      input.submittedForms.length === 0
        ? "not_applicable"
        : placeholders.length
          ? "fail"
          : blanks.length
            ? "warning"
            : "pass",
    detail:
      input.submittedForms.length === 0
        ? "No submitted forms."
        : `${blanks.length} field(s) left blank, ${placeholders.length} field(s) hold placeholder values.`,
    values: [...placeholders.slice(0, 10), ...blanks.slice(0, 10)],
  });

  const emptyDocs = input.documents.filter((d) => {
    const size = toNumber(d.file_size);
    return size !== null && size <= 0;
  });
  const nameCount = new Map<string, number>();
  input.documents.forEach((d) => {
    const n = asText(d.file_name).trim().toLowerCase();
    if (!n) return;
    nameCount.set(n, (nameCount.get(n) || 0) + 1);
  });
  const dupeNames = Array.from(nameCount.entries()).filter(([, c]) => c > 1);

  add({
    key: "document_integrity",
    label: "Uploaded documents are usable and unique",
    group: "completeness",
    status:
      input.documents.length === 0
        ? "fail"
        : emptyDocs.length
          ? "fail"
          : dupeNames.length
            ? "warning"
            : "pass",
    detail:
      input.documents.length === 0
        ? "No documents are attached to this application."
        : `${input.documents.length} document(s): ${emptyDocs.length} empty file(s), ${dupeNames.length} duplicate file name(s).`,
    values: [
      ...emptyDocs.slice(0, 8).map((d) => ({ label: asText(d.file_name), value: "zero-byte file" })),
      ...dupeNames.slice(0, 8).map(([n, c]) => ({ label: n, value: `uploaded ${c} times` })),
    ],
  });

  /* ------------------------------ lifecycle ------------------------------ */
  const openRfis = input.rfiRequests.length;
  if (openRfis === 0) {
    add({
      key: "rfi_response_integrity",
      label: "Information requests answered with real changes",
      group: "lifecycle",
      status: "not_applicable",
      detail: "No information request has been raised on this application.",
    });
  } else {
    const lastRfiAt = input.rfiRequests
      .map((r) => (r.created_at ? new Date(String(r.created_at)).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    const updatedAt = input.formDataUpdatedAt ? new Date(input.formDataUpdatedAt).getTime() : 0;
    const changed = updatedAt > lastRfiAt;
    add({
      key: "rfi_response_integrity",
      label: "Information requests answered with real changes",
      group: "lifecycle",
      status: changed ? "pass" : "warning",
      detail: changed
        ? "Form data was updated after the most recent information request."
        : "No form-data change is recorded after the most recent information request.",
      values: [
        { label: "Last information request", value: lastRfiAt ? new Date(lastRfiAt).toISOString() : "unknown" },
        { label: "Last form-data change", value: updatedAt ? new Date(updatedAt).toISOString() : "none recorded" },
        { label: "Responses recorded", value: String(input.rfiResponses.length) },
      ],
    });
  }

  const unsubmittedForms = input.submittedForms.filter(
    (f) => !["submitted", "completed", "approved"].includes(String(f.status || "").toLowerCase()),
  );
  add({
    key: "form_submission_state",
    label: "All attached forms are in a submitted state",
    group: "lifecycle",
    status:
      input.submittedForms.length === 0 ? "fail" : unsubmittedForms.length ? "warning" : "pass",
    detail:
      input.submittedForms.length === 0
        ? "No form responses are attached to this application."
        : unsubmittedForms.length
          ? `${unsubmittedForms.length} of ${input.submittedForms.length} form(s) are not in a submitted state.`
          : `All ${input.submittedForms.length} form(s) are submitted.`,
    values: unsubmittedForms.slice(0, 10).map((f, i) => ({
      label: String(f.template_name || `Form ${i + 1}`),
      value: asText(f.status) || "no status",
    })),
  });

  const counts = { pass: 0, warning: 0, fail: 0, not_applicable: 0 };
  checks.forEach((c) => {
    counts[c.status] += 1;
  });

  return { computed_at: new Date().toISOString(), counts, checks };
}
