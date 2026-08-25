// Public Market Conduct complaint intake (no auth).
//
//   GET  ?action=entities&q=            -> regulated entities that may be complained against
//   GET  ?action=types                  -> active complaint types
//   POST { ...complaint }               -> lodge a complaint, returns the reference number
//
// Consumers of financial services are not portal users, so this entry point is
// deliberately unauthenticated. Protections: strict field whitelist, server-side
// validation, honeypot, and a per-email / per-IP rate limit. The complaint enters
// the existing triage + workflow pipeline exactly like an internal intake.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('Public consumer market-conduct complaint intake');

const MAX_PER_EMAIL_PER_HOUR = 5;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "entities";

      if (action === "types") {
        const { data, error } = await admin
          .from("complaint_types")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        if (error) return json({ error: error.message }, 500);
        return json({ rows: data || [] });
      }

      if (action === "entities") {
        // Eligible respondents = entities that currently hold a regulated licence.
        // `licenses.holder_id` has no FK, so the join is done explicitly.
        const q = clean(url.searchParams.get("q"), 120);
        const { data: lics, error: licErr } = await admin
          .from("licenses")
          .select("holder_id")
          .eq("status", "active")
          .limit(2000);
        if (licErr) return json({ error: licErr.message }, 500);
        const holderIds = [...new Set((lics || []).map((l: any) => l.holder_id).filter(Boolean))];
        if (!holderIds.length) return json({ rows: [] });
        const { data, error } = await admin
          .from("licensees")
          .select("id, name, sectors(name)")
          .in("id", holderIds)
          .order("name");
        if (error) return json({ error: error.message }, 500);
        let rows = (data || []).map((r: any) => ({
          id: r.id,
          name: r.name || "Unnamed entity",
          sector_name: r.sectors?.name || null,
        }));
        if (q) {
          const needle = q.toLowerCase();
          rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
        }
        return json({ rows });
      }

      return json({ error: "unknown action" }, 400);
    }

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));

    // Honeypot: bots fill hidden fields, humans never do.
    if (clean(body.website, 200)) return json({ ok: true, reference: null });

    const subject = clean(body.subject, 200);
    const description = clean(body.description, 8000);
    const email = clean(body.email, 200).toLowerCase();
    const fullName = clean(body.full_name, 150);
    const phone = clean(body.phone, 40);
    const licenseeId = clean(body.licensee_id, 64);
    const complaintTypeId = clean(body.complaint_type_id, 64);

    const errors: Record<string, string> = {};
    if (subject.length < 5) errors.subject = "Please provide a short summary (at least 5 characters).";
    if (description.length < 30) errors.description = "Please describe what happened (at least 30 characters).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "A valid email address is required.";
    if (!fullName) errors.full_name = "Your name is required.";
    if (!licenseeId) errors.licensee_id = "Please select the entity you are complaining about.";
    if (Object.keys(errors).length) return json({ error: "validation_failed", fields: errors }, 400);

    // Respondent must actually be a regulated entity holding an active licence.
    const { data: lic } = await admin
      .from("licenses")
      .select("id, holder_id")
      .eq("holder_id", licenseeId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!lic) {
      return json({ error: "validation_failed", fields: { licensee_id: "That entity is not currently licensed." } }, 400);
    }

    // Rate limit per email.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((count || 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return json({ error: "rate_limited", message: "Too many complaints submitted from this email address. Please try again later." }, 429);
    }

    const { data: licensee } = await admin
      .from("licensees")
      .select("id, regulator_id")
      .eq("id", licenseeId)
      .maybeSingle();

    const insertRow: Record<string, unknown> = {
      subject,
      description: `${description}\n\n--\nComplainant: ${fullName}${phone ? ` | Phone: ${phone}` : ""} | Email: ${email}`,
      email,
      licensee_id: licenseeId,
      license_holder_id: licenseeId,
      complaint_type_id: complaintTypeId || null,
      regulator_id: (licensee as any)?.regulator_id || null,
      status: "submitted",
      intake_source: "public_portal",
    };

    const { data: created, error: insErr } = await admin
      .from("complaints")
      .insert(insertRow)
      .select("id, complaint_number")
      .single();
    if (insErr) return json({ error: insErr.message }, 200);

    return json({ ok: true, reference: created.complaint_number, id: created.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
