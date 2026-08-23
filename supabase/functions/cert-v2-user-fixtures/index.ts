// ============================================================================
// Certification V2 — governed certification-user fixtures (NON-PRODUCTION only).
//
// Actions
//   provision   create/adopt one login-capable account per certifiable role
//   purge_auth  delete every auth user that is not a certification account
//   verify      per-user verification incl. real sign-in
//   manifest    return the machine-readable certification-user manifest
//
// The initial password is read from the CERT_V2_DEFAULT_PASSWORD project secret
// at runtime. It is never logged, returned, or persisted.
// ============================================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMAIN = 'mishainfotech.com';
const SUPER_ADMIN_ROLE_KEY = 'super_admin';

type RoleRow = {
  role_id: string;
  role_key: string;
  role_name: string;
  audience: 'internal' | 'external' | 'break_glass';
  role_class: string;
  legacy_class: string | null;
  certify: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const emailFor = (roleKey: string) =>
  `${roleKey.toLowerCase().replace(/[^a-z0-9._-]/g, '_')}@${DOMAIN}`;

const personaFamily = (r: RoleRow) => {
  if (r.audience === 'break_glass') return 'PLATFORM_BREAK_GLASS';
  if (r.audience === 'external') return 'EXTERNAL_REGULATED_PARTY';
  const k = r.role_key;
  if (k.startsWith('registration') || k.startsWith('licensing') || k.startsWith('entity_resolution'))
    return 'AUTHORISATION';
  if (k.startsWith('returns') || k.startsWith('prudential') || k.startsWith('payment_systems') || k.startsWith('operational_resilience'))
    return 'PRUDENTIAL_AND_RETURNS';
  if (k.startsWith('complaints') || k.startsWith('conduct')) return 'CONDUCT_AND_COMPLAINTS';
  if (k.startsWith('enforcement') || k.startsWith('inspect') || k.startsWith('aml')) return 'SUPERVISORY_ACTION';
  if (k.startsWith('fit_proper') || k === 'committee_member') return 'FIT_AND_PROPER';
  if (k.endsWith('_administrator') || k === 'system_administrator') return 'PLATFORM_ADMINISTRATION';
  if (['legal_counsel', 'auditor', 'appeals_panel_member', 'executive_management', 'read_only'].includes(k))
    return 'OVERSIGHT_AND_ASSURANCE';
  return 'SUPERVISORY_SUPPORT';
};

const userTypeFor = (r: RoleRow) => {
  if (r.audience !== 'external') return 'employee';
  if (r.role_key === 'licensee_secondary_user') return 'secondary';
  return 'primary';
};

// legacy compatibility enum values only
const LEGACY_APP_ROLE: Record<string, string> = {
  super_admin: 'super_admin',
  licensing_officer: 'licensing_officer',
  applicant_user: 'applicant',
  pre_licensee_user: 'pre_licensee',
  licensee_primary_user: 'licensee_primary',
  licensee_secondary_user: 'licensee_secondary',
  legal_counsel: 'legal_compliance',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const password = Deno.env.get('CERT_V2_DEFAULT_PASSWORD');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    const { action = 'manifest' } = (await req.json().catch(() => ({}))) as { action?: string };

    // -------------------------------------------------------------- guard rails
    const { data: guard } = await admin.from('cert_nonproduction_guard').select('*').limit(1).maybeSingle();
    if (!guard) return json({ ok: false, error: 'Non-production guard row missing; refusing to run.' });

    const listAllUsers = async () => {
      const all: { id: string; email: string | null }[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        all.push(...(data.users ?? []).map((u) => ({ id: u.id, email: u.email ?? null })));
        if ((data.users ?? []).length < 200) break;
      }
      return all;
    };

    // ------------------------------------------------------------------ PROVISION
    if (action === 'provision') {
      if (!password || password.length < 8) {
        return json({ ok: false, error: 'CERT_V2_DEFAULT_PASSWORD is not configured for this function.' });
      }

      const { data: catalogue, error: catErr } = await admin.rpc('cert_v2_role_catalogue');
      if (catErr) throw catErr;
      const roles = (catalogue as RoleRow[]).filter((r) => r.certify);

      // module map per role (expected modules the persona should reach)
      const { data: modRows, error: modErr } = await admin
        .from('sec_role_permissions')
        .select('role_id, sec_permissions!inner(sec_modules!inner(key))');
      if (modErr) throw modErr;
      const modulesByRole = new Map<string, Set<string>>();
      for (const row of (modRows ?? []) as any[]) {
        const key = row.sec_permissions?.sec_modules?.key;
        if (!key) continue;
        if (!modulesByRole.has(row.role_id)) modulesByRole.set(row.role_id, new Set());
        modulesByRole.get(row.role_id)!.add(key);
      }

      const existing = await listAllUsers();
      const byEmail = new Map(existing.map((u) => [(u.email ?? '').toLowerCase(), u.id]));

      const results: Record<string, unknown>[] = [];
      // super admin first so the project is never left without an administrator
      roles.sort((a, b) => (a.role_key === SUPER_ADMIN_ROLE_KEY ? -1 : b.role_key === SUPER_ADMIN_ROLE_KEY ? 1 : 0));

      for (const role of roles) {
        const email = emailFor(role.role_key);
        const fullName = `Certification - ${role.role_name}`;
        let userId = byEmail.get(email) ?? null;

        if (!userId) {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, certification_fixture: true, role_key: role.role_key },
          });
          if (createErr || !created?.user) {
            results.push({ email, role_key: role.role_key, ok: false, error: createErr?.message ?? 'create failed' });
            continue;
          }
          userId = created.user.id;
        } else {
          const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, certification_fixture: true, role_key: role.role_key },
          });
          if (updErr) {
            results.push({ email, role_key: role.role_key, ok: false, error: updErr.message });
            continue;
          }
        }

        const { error: profileErr } = await admin.from('profiles').upsert(
          {
            id: userId,
            full_name: fullName,
            email,
            user_type: userTypeFor(role),
            entity_name: role.audience === 'external' ? '' : 'Regulator',
            role: role.role_key,
            status: 'active',
            role_id: role.role_id,
            force_password_change: false,
          },
          { onConflict: 'id' },
        );
        if (profileErr) {
          results.push({ email, role_key: role.role_key, ok: false, error: profileErr.message });
          continue;
        }

        await admin
          .from('sec_user_roles')
          .upsert({ user_id: userId, role_id: role.role_id, status: 'active' }, { onConflict: 'user_id,role_id' });
        await admin
          .from('user_dynamic_roles')
          .upsert({ user_id: userId, role_id: role.role_id }, { onConflict: 'user_id,role_id' });

        const legacy = LEGACY_APP_ROLE[role.role_key];
        if (legacy) {
          await admin.from('user_roles').upsert({ user_id: userId, role: legacy }, { onConflict: 'user_id,role' });
        }

        await admin.from('cert_certification_users').upsert(
          {
            user_id: userId,
            email,
            role_key: role.role_key,
            role_id: role.role_id,
            persona_family: personaFamily(role),
            audience: role.audience,
            role_display_name: role.role_name,
            expected_modules: Array.from(modulesByRole.get(role.role_id) ?? []).sort(),
            is_machine: false,
          },
          { onConflict: 'user_id' },
        );

        results.push({ email, role_key: role.role_key, user_id: userId, ok: true });
      }

      return json({
        ok: results.every((r) => r.ok),
        provisioned: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok),
        results,
      });
    }

    // ----------------------------------------------------------------- PURGE AUTH
    if (action === 'purge_auth') {
      const { data: manifest, error: mErr } = await admin.from('cert_certification_users').select('user_id, email');
      if (mErr) throw mErr;
      if (!manifest || manifest.length === 0) {
        return json({ ok: false, error: 'Certification manifest is empty; provision first.' });
      }
      const keep = new Set(manifest.map((m) => m.user_id));
      const all = await listAllUsers();
      const deleted: string[] = [];
      const failed: Record<string, string>[] = [];
      for (const u of all) {
        if (keep.has(u.id)) continue;
        const { error } = await admin.auth.admin.deleteUser(u.id);
        if (error) failed.push({ user: u.email ?? u.id, error: error.message });
        else deleted.push(u.email ?? u.id);
      }
      return json({ ok: failed.length === 0, deleted_count: deleted.length, deleted, failed });
    }

    // --------------------------------------------------------------------- VERIFY
    if (action === 'verify') {
      if (!password) return json({ ok: false, error: 'CERT_V2_DEFAULT_PASSWORD is not configured.' });
      const { data: manifest, error: mErr } = await admin
        .from('cert_certification_users')
        .select('user_id, email, role_key, role_id, persona_family, audience');
      if (mErr) throw mErr;

      const checks: Record<string, unknown>[] = [];
      for (const m of manifest ?? []) {
        const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
        const { data: profile } = await admin.from('profiles').select('id').eq('id', m.user_id).maybeSingle();
        const { data: roleAssign } = await admin
          .from('sec_user_roles')
          .select('status, sec_roles!inner(status)')
          .eq('user_id', m.user_id)
          .eq('role_id', m.role_id)
          .maybeSingle();
        const { count: permCount } = await admin
          .from('sec_role_permissions')
          .select('*', { count: 'exact', head: true })
          .eq('role_id', m.role_id);
        const { count: accessCount } = await admin
          .from('entity_user_access')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', m.user_id);

        const anon = createClient(url, anonKey, { auth: { persistSession: false } });
        const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
          email: m.email,
          password,
        });
        let context: unknown = null;
        if (signIn?.session) {
          const scoped = createClient(url, anonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
          });
          const { data: ctx } = await scoped.rpc('sec_get_user_context');
          context = ctx ? true : false;
          await anon.auth.signOut();
        }

        checks.push({
          email: m.email,
          role_key: m.role_key,
          auth_exists: !!authUser?.user,
          profile_exists: !!profile,
          role_assigned_active: roleAssign?.status === 'active',
          role_active: (roleAssign as any)?.sec_roles?.status === 'active',
          effective_permissions: permCount ?? 0,
          login_ok: !!signIn?.session,
          login_error: signInErr?.message ?? null,
          user_context_ok: context === true,
          unrelated_entity_access: accessCount ?? 0,
        });
      }

      const failures = checks.filter(
        (c) =>
          !c.auth_exists ||
          !c.profile_exists ||
          !c.role_assigned_active ||
          !c.role_active ||
          !c.login_ok ||
          !c.user_context_ok ||
          (c.effective_permissions as number) === 0 ||
          (c.unrelated_entity_access as number) !== 0,
      );
      return json({ ok: failures.length === 0, total: checks.length, failures, checks });
    }

    // ------------------------------------------------------------------- MANIFEST
    const { data: manifest, error } = await admin
      .from('cert_certification_users')
      .select('user_id, email, role_key, role_id, persona_family, audience, role_display_name, expected_modules')
      .order('email');
    if (error) throw error;
    return json({ ok: true, count: manifest?.length ?? 0, users: manifest });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('cert-v2-user-fixtures failed:', message);
    return json({ ok: false, error: message });
  }
});
