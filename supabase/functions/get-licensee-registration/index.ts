import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const scoreApplicationMatch = (applicationData: any, entity: any) => {
  if (!applicationData || typeof applicationData !== "object") return 0;

  const entityName = normalizeText(entity?.name);
  const candidateNames = [applicationData?.entity_name, applicationData?.applicant_name].map(normalizeText);

  let score = 0;
  if (entityName && candidateNames.some((name) => name && name === entityName)) score += 8;
  if (entity?.sector_id && applicationData?.sector_id === entity.sector_id) score += 2;
  if (entity?.sub_sector_id && applicationData?.sub_sector_id === entity.sub_sector_id) score += 3;
  if (entity?.category_id && applicationData?.category_id === entity.category_id) score += 4;

  return score;
};

async function fetchLatestRegistration(admin: ReturnType<typeof createClient>, column: "registration_reference" | "user_id" | "email" | "applicant_name", value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  let query = admin.from("registrations").select("*").order("created_at", { ascending: false }).limit(1);
  if (column === "user_id" || column === "registration_reference") {
    query = query.eq(column, trimmedValue);
  } else {
    query = query.ilike(column, trimmedValue);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchApplicantRecords(admin: ReturnType<typeof createClient>, applicantId: string | null) {
  if (!applicantId) {
    return { profileRecord: null, preLicenseUserRecord: null };
  }

  const [profileRes, preLicenseRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, phone, entity_name, department").eq("id", applicantId).maybeSingle(),
    admin.from("pre_license_users").select("id, full_name, email, phone, entity_name, department").eq("id", applicantId).maybeSingle(),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (preLicenseRes.error) throw preLicenseRes.error;

  return {
    profileRecord: profileRes.data || null,
    preLicenseUserRecord: preLicenseRes.data || null,
  };
}

async function fetchBestApplicationForApplicant(admin: ReturnType<typeof createClient>, applicantId: string, entity: any) {
  const { data: applications, error } = await admin
    .from("applications")
    .select("id, applicant_id, data, created_at")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  const rankedApplications = (applications || []).map((application: any, index: number) => ({
    application,
    score: scoreApplicationMatch(application?.data, entity),
    index,
  }));

  rankedApplications.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.index - right.index;
  });

  return rankedApplications[0]?.application || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      admin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" }),
    ]);

    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const inputEntity = {
      id: typeof body?.entity_id === "string" ? body.entity_id : null,
      license_id: typeof body?.license_id === "string" ? body.license_id : null,
      name: typeof body?.name === "string" ? body.name : "",
      sector_id: typeof body?.sector_id === "string" ? body.sector_id : null,
      sub_sector_id: typeof body?.sub_sector_id === "string" ? body.sub_sector_id : null,
      category_id: typeof body?.category_id === "string" ? body.category_id : null,
    };

    if (!inputEntity.id && !inputEntity.license_id && !inputEntity.name) {
      return new Response(JSON.stringify({ error: "Entity details are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let entityRecord = inputEntity;
    if (inputEntity.id) {
      const { data: licenseeRow, error: licenseeError } = await admin
        .from("licensees")
        .select("id, license_id, name, sector_id, sub_sector_id, category_id")
        .eq("id", inputEntity.id)
        .maybeSingle();

      if (licenseeError) throw licenseeError;
      if (licenseeRow) {
        entityRecord = { ...inputEntity, ...licenseeRow };
      }
    }

    const entityName = String(entityRecord?.name || "").trim();
    let applicantId: string | null = null;
    let licenseRecord: any = null;
    let applicationRecord: any = null;
    let registrationRecord: any = null;
    let profileRecord: any = null;
    let preLicenseUserRecord: any = null;

    if (entityRecord?.license_id) {
      const { data: license, error: licenseError } = await admin
        .from("licenses")
        .select("id, license_number, application_id")
        .eq("id", entityRecord.license_id)
        .maybeSingle();

      if (licenseError) throw licenseError;
      licenseRecord = license || null;

      if (licenseRecord?.application_id) {
        const { data: application, error: applicationError } = await admin
          .from("applications")
          .select("id, applicant_id, data, created_at")
          .eq("id", licenseRecord.application_id)
          .maybeSingle();

        if (applicationError) throw applicationError;
        applicationRecord = application || null;
        applicantId = application?.applicant_id || null;
      }
    }

    const applicationData = applicationRecord?.data && typeof applicationRecord.data === "object"
      ? applicationRecord.data
      : null;
    const registrationReference = typeof applicationData?.registration_reference === "string"
      ? applicationData.registration_reference.trim()
      : "";

    if (applicantId) {
      registrationRecord = await fetchLatestRegistration(admin, "user_id", applicantId);
      const applicantRecords = await fetchApplicantRecords(admin, applicantId);
      profileRecord = applicantRecords.profileRecord;
      preLicenseUserRecord = applicantRecords.preLicenseUserRecord;
    }

    if (!registrationRecord && registrationReference) {
      registrationRecord = await fetchLatestRegistration(admin, "registration_reference", registrationReference);
    }

    if (!applicantId && entityName) {
      const [profileByEntityRes, preLicenseByEntityRes] = await Promise.all([
        admin
          .from("profiles")
          .select("id, full_name, email, phone, entity_name, department, created_at")
          .ilike("entity_name", entityName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("pre_license_users")
          .select("id, full_name, email, phone, entity_name, department, created_at")
          .ilike("entity_name", entityName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileByEntityRes.error) throw profileByEntityRes.error;
      if (preLicenseByEntityRes.error) throw preLicenseByEntityRes.error;

      profileRecord = profileByEntityRes.data || profileRecord;
      preLicenseUserRecord = preLicenseByEntityRes.data || preLicenseUserRecord;
      applicantId = profileRecord?.id || preLicenseUserRecord?.id || null;
    }

    if (!applicationRecord && applicantId) {
      applicationRecord = await fetchBestApplicationForApplicant(admin, applicantId, entityRecord);
    }

    const resolvedApplicationData = applicationRecord?.data && typeof applicationRecord.data === "object"
      ? applicationRecord.data
      : null;

    if (!registrationRecord && applicantId) {
      registrationRecord = await fetchLatestRegistration(admin, "user_id", applicantId);
    }

    const candidateEmail = [
      registrationRecord?.email,
      profileRecord?.email,
      preLicenseUserRecord?.email,
      resolvedApplicationData?.email,
    ].map((value) => String(value || "").trim()).find(Boolean) || "";

    const candidateNames = Array.from(new Set([
      registrationRecord?.applicant_name,
      resolvedApplicationData?.applicant_name,
      resolvedApplicationData?.entity_name,
      profileRecord?.entity_name,
      preLicenseUserRecord?.entity_name,
      entityName,
    ].map((value) => String(value || "").trim()).filter(Boolean)));

    if (!registrationRecord && registrationReference) {
      registrationRecord = await fetchLatestRegistration(admin, "registration_reference", registrationReference);
    }

    if (!registrationRecord && candidateEmail) {
      registrationRecord = await fetchLatestRegistration(admin, "email", candidateEmail);
    }

    if (!registrationRecord) {
      for (const candidateName of candidateNames) {
        registrationRecord = await fetchLatestRegistration(admin, "applicant_name", candidateName);
        if (registrationRecord) break;
      }
    }

    const resolvedApplicantId = applicantId || registrationRecord?.user_id || null;
    if ((!profileRecord && !preLicenseUserRecord) && resolvedApplicantId) {
      const applicantRecords = await fetchApplicantRecords(admin, resolvedApplicantId);
      profileRecord = applicantRecords.profileRecord;
      preLicenseUserRecord = applicantRecords.preLicenseUserRecord;
    }

    return new Response(JSON.stringify({
      entity: entityRecord,
      license: licenseRecord,
      application: applicationRecord,
      applicant: profileRecord || preLicenseUserRecord || null,
      registration: registrationRecord || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("get-licensee-registration failed:", error?.message || error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});