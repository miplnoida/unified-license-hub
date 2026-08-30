// Public Registry (no auth) - exposes sanitized, publishable data:
//   ?action=licensees&q=&sector=&limit=&offset=   -> active licenses
//   ?action=licensee&id=<license_id>              -> single license + open enforcement count
//   ?action=enforcement&limit=&offset=            -> closed/published enforcement outcomes
//   ?action=stats                                 -> counts for landing page
//
// Only whitelisted fields are ever returned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('Public read of published licensees / registrations');

// Canonical public.licenses columns. `issue_date` / `expiry_date` / `licensee_id`
// never existed on this table; the stale names made the whole registry return
// HTTP 500 (RF-17/RF-18). There is no licenses -> licensees FK: the relationship
// is the reverse one (licensees.license_id -> licenses.id), so the licensee is
// embedded through that constraint and arrives as an array.
const SAFE_LICENSE_FIELDS =
  "id, license_number, license_type, status, issued_at, valid_from, valid_until";
const LICENSEE_EMBED = "licensees!licensees_license_id_fkey(id, name, sector_id, sectors(name))";

/** Reverse-FK embeds arrive as arrays; collapse to the single holder. */
function holder(row: Record<string, unknown> | null): Record<string, any> | null {
  const v = (row as any)?.licensees;
  return Array.isArray(v) ? (v[0] ?? null) : ((v as any) ?? null);
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "stats";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "stats") {
      const [lic, enf, sect] = await Promise.all([
        admin.from("licenses").select("id", { count: "exact", head: true }).eq("status", "active"),
        admin.from("enforcement_actions").select("id", { count: "exact", head: true }).in("status", ["closed", "decided"]),
        admin.from("sectors").select("id", { count: "exact", head: true }),
      ]);
      return json({
        active_licenses: lic.count || 0,
        published_enforcements: enf.count || 0,
        sectors: sect.count || 0,
      });
    }

    if (action === "licensees") {
      const q = (url.searchParams.get("q") || "").trim();
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
      let query = admin
        .from("licenses")
        .select(`${SAFE_LICENSE_FIELDS}, ${LICENSEE_EMBED}`, { count: "exact" })
        .eq("status", "active")
        .order("issued_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (q) query = query.ilike("license_number", `%${q}%`);
      const { data, error, count } = await query;
      if (error) return json({ error: error.message }, 500);
      const rows = (data || []).map((r: any) => ({
        id: r.id,
        license_number: r.license_number,
        license_type: r.license_type,
        issue_date: r.issued_at,
        expiry_date: r.valid_until,
        licensee_name: holder(r)?.name || null,
        sector_name: holder(r)?.sectors?.name || null,
      }));
      return json({ rows, total: count || 0 });
    }

    if (action === "licensee") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const { data: lic } = await admin
        .from("licenses")
        .select(`${SAFE_LICENSE_FIELDS}, ${LICENSEE_EMBED}`)
        .eq("id", id).eq("status", "active").maybeSingle();
      if (!lic) return json({ error: "not found" }, 404);
      const licensee_id = holder(lic)?.id ?? null;
      const { count: enfCount } = await admin
        .from("enforcement_actions")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", licensee_id)
        .in("status", ["closed", "decided"]);
      return json({
        license: {
          id: lic.id,
          license_number: lic.license_number,
          license_type: lic.license_type,
          issue_date: (lic as any).issued_at,
          expiry_date: (lic as any).valid_until,
          licensee_name: holder(lic)?.name || null,
          sector_name: holder(lic)?.sectors?.name || null,
        },
        enforcement_count: enfCount || 0,
      });
    }

    if (action === "enforcement") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
      const { data, error, count } = await admin
        .from("enforcement_actions")
        .select("id, enforcement_type, status, decision_outcome, decision_rationale, decision_at, closed_at, penalty_amount, licensees(name)", { count: "exact" })
        .in("status", ["closed", "decided"])
        .order("decision_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      if (error) return json({ error: error.message }, 500);
      const rows = (data || []).map((r: any) => ({
        id: r.id,
        enforcement_type: r.enforcement_type,
        status: r.status,
        decision_outcome: r.decision_outcome,
        decision_rationale: r.decision_rationale,
        decision_at: r.decision_at || r.closed_at,
        penalty_amount: r.penalty_amount,
        licensee_name: r.licensees?.name || null,
      }));
      return json({ rows, total: count || 0 });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
