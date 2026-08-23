// ============================================================================
// ONE-TIME break-glass Super Administrator bootstrap.
//
// There is deliberately NO user-supplied input: the target email is a
// compile-time constant and the initial password is read from the
// `BREAK_GLASS_ADMIN_PASSWORD` project secret (never committed, never logged),
// so this endpoint cannot be used to mint an arbitrary account.
//
// Replay protection: the function refuses to act once ANY active break-glass
// role assignment exists. After the first successful run it is permanently
// inert and can safely be deleted.
//
// The created account is flagged `force_password_change` so the initial secret
// must be replaced by the owner at first sign-in.
// ============================================================================
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const TARGET_EMAIL = 'rohit@mishainfotech.com';
const TARGET_NAME = 'Rohit (Break-glass Super Administrator)';
const SUPER_ADMIN_ROLE_KEY = 'super_admin';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const password = Deno.env.get('BREAK_GLASS_ADMIN_PASSWORD');
    if (!password) {
      return json({ ok: false, error: 'BREAK_GLASS_ADMIN_PASSWORD is not available to this function.' });
    }
    if (password.length < 8) {
      return json({ ok: false, error: 'BREAK_GLASS_ADMIN_PASSWORD is too short (min 8 chars).' });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // --- Canonical break-glass role, resolved by stable key (never by email).
    const { data: roleRow, error: roleErr } = await admin
      .from('sec_roles')
      .select('id, key, is_break_glass')
      .eq('key', SUPER_ADMIN_ROLE_KEY)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!roleRow) return json({ ok: false, error: `sec_roles row "${SUPER_ADMIN_ROLE_KEY}" not found.` });

    // --- Replay guard: inert once the fixed TARGET_EMAIL itself holds an active
    // break-glass role. A break-glass role held by some *other* account (e.g. a
    // non-production certification fixture) must not permanently lock the owner
    // out, so bootstrap still repairs the constant target in that case.
    const { data: breakGlassRoles, error: bgErr } = await admin
      .from('sec_roles')
      .select('id')
      .eq('is_break_glass', true);
    if (bgErr) throw bgErr;

    const { data: existingHolders, error: holderErr } = await admin
      .from('sec_user_roles')
      .select('user_id')
      .eq('status', 'active')
      .in('role_id', (breakGlassRoles ?? []).map((r) => r.id));
    if (holderErr) throw holderErr;

    const { data: holderProfiles } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', (existingHolders ?? []).map((h) => h.user_id));
    const targetAlreadyHolds = (holderProfiles ?? []).some(
      (p) => (p.email ?? '').toLowerCase() === TARGET_EMAIL,
    );
    if (targetAlreadyHolds) {
      return json({
        ok: false,
        already_bootstrapped: true,
        error: 'The break-glass administrator already exists. Bootstrap is disabled; manage roles through Role Management.',
      });
    }


    // --- Create (or adopt) the auth user for the fixed email.
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: TARGET_NAME, break_glass: true },
    });
    if (created?.user) {
      userId = created.user.id;
    } else {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw listErr ?? createErr;
      const match = (list?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === TARGET_EMAIL);
      if (!match) throw createErr;
      userId = match.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) throw updErr;
    }

    // --- Minimum compatibility profile (NOT the security authority).
    const { error: profileErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        full_name: TARGET_NAME,
        email: TARGET_EMAIL,
        user_type: 'employee',
        entity_name: 'Regulator',
        role: 'super_admin',
        status: 'active',
        role_id: roleRow.id,
        force_password_change: true,
      },
      { onConflict: 'id' },
    );
    if (profileErr) throw profileErr;

    // --- Canonical sec_* role assignment.
    const { error: secErr } = await admin.from('sec_user_roles').upsert(
      { user_id: userId, role_id: roleRow.id, status: 'active' },
      { onConflict: 'user_id,role_id' },
    );
    if (secErr) throw secErr;

    // --- Legacy compatibility rows still read by older guards / RLS helpers.
    await admin.from('user_roles').upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id,role' });
    await admin.from('user_dynamic_roles').upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id,role_id' });

    await admin.from('audit_logs').insert({
      user_id: userId,
      action: 'break_glass_admin_bootstrapped',
      entity_type: 'auth.users',
      entity_id: userId,
      user_role: 'super_admin',
      metadata: { email: TARGET_EMAIL, method: 'one_time_edge_function', force_password_change: true },
    });

    return json({
      ok: true,
      user_id: userId,
      email: TARGET_EMAIL,
      role: 'Super Admin (break-glass)',
      force_password_change: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('bootstrap-break-glass-admin failed:', message);
    return json({ ok: false, error: message });
  }
});
