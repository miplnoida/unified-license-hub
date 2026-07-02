// Public Registry (no auth) - exposes sanitized, publishable data:
//   ?action=licensees&q=&sector=&limit=&offset=   -> active licenses
//   ?action=licensee&id=<license_id>              -> single license + open enforcement count
//   ?action=enforcement&limit=&offset=            -> closed/published enforcement outcomes
//   ?action=stats                                 -> counts for landing page
//
// Only whitelisted fields are ever returned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const SAFE_LICENSE_FIELDS =
  "id, license_number, license_type, status, issue_date, expiry_date, licensee_id";

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
        .select(`${SAFE_LICENSE_FIELDS}, licensees!inner(id, name, sector_id, sectors(name))`, { count: "exact" })
        .eq("status", "active")
        .order("issue_date", { ascending: false })
        .range(offset, offset + limit - 1);
      if (q) query = query.ilike("license_number", `%${q}%`);
      const { data, error, count } = await query;
      if (error) return json({ error: error.message }, 500);
      const rows = (data || []).map((r: any) => ({
        id: r.id,
        license_number: r.license_number,
        license_type: r.license_type,
        issue_date: r.issue_date,
        expiry_date: r.expiry_date,
        licensee_name: r.licensees?.name || null,
        sector_name: r.licensees?.sectors?.name || null,
      }));
      return json({ rows, total: count || 0 });
    }

    if (action === "licensee") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const { data: lic } = await admin
        .from("licenses")
        .select(`${SAFE_LICENSE_FIELDS}, licensees(id, name, sector_id, sectors(name))`)
        .eq("id", id).eq("status", "active").maybeSingle();
      if (!lic) return json({ error: "not found" }, 404);
      const licensee_id = (lic as any).licensee_id;
      const { count: enfCount } = await admin
        .from("enforcement_actions")
        .select("id", { count: "exact", head: true })
        .eq("licensee_id", licensee_id)
        .in("status", ["closed", "decided"]);
      return json({
        license: {
          id: lic.id,
          license_number: lic.license_number,
          license_type: lic.license_type,
          issue_date: lic.issue_date,
          expiry_date: lic.expiry_date,
          licensee_name: (lic as any).licensees?.name || null,
          sector_name: (lic as any).licensees?.sectors?.name || null,
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
