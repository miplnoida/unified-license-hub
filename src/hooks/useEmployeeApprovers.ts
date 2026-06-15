/**
 * Employee-based approver picker for "specific users" approver type.
 *
 * Returns profile records from the Employee Management list — i.e. internal
 * staff records that also have a login account in `profiles` and can act on
 * approval steps. Mirrors the same filter used by
 * `src/pages/admin/UserManagement.tsx`:
 *
 *   - Include if user_type is 'employee' (or legacy 'internal_employee')
 *   - OR the user holds an internal app_role
 *     (super_admin, admin, supervisor, licensing_officer, analyst, developer)
 *   - Always exclude external pre_licensee / licensee accounts
 *
 * Approver IDs are stored as profile ids in `approver_config.user_ids` to stay
 * compatible with the runtime workflow engine, which resolves approvers via
 * profiles.id.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmployeeApprover {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  primary_role: string | null;
}

const INTERNAL_APP_ROLES = new Set([
  'super_admin',
  'admin',
  'supervisor',
  'licensing_officer',
  'analyst',
  'developer',
]);

const EXTERNAL_USER_TYPES = new Set(['primary', 'secondary', 'pre_licensee', 'applicant']);

export function useEmployeeApprovers(search?: string) {
  return useQuery({
    queryKey: ['employee_approvers', search ?? ''],
    queryFn: async (): Promise<EmployeeApprover[]> => {
      const [{ data: profiles, error: pErr }, { data: roleRows, error: rErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, department, user_type, status'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const roleByUser = new Map<string, string>();
      for (const r of ((roleRows ?? []) as Array<{ user_id: string; role: string }>)) {
        // Take the first internal role per user as "primary_role" display
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      }

      const q = (search || '').trim().toLowerCase();
      return ((profiles ?? []) as any[])
        .filter(p => {
          const appRole = roleByUser.get(p.id) || '';
          const userType = (p.user_type as string) || '';
          // Same logic as Employee Management page
          if (EXTERNAL_USER_TYPES.has(userType) && !INTERNAL_APP_ROLES.has(appRole)) return false;
          if (userType === 'employee' || userType === 'internal_employee') return true;
          if (INTERNAL_APP_ROLES.has(appRole)) return true;
          return false;
        })
        .map(p => ({
          id: p.id as string,
          full_name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          department: (p.department as string | null) ?? null,
          designation: null,
          primary_role: roleByUser.get(p.id) ?? null,
        }))
        .filter(u => {
          if (!q) return true;
          const hay = `${u.full_name || ''} ${u.email || ''} ${u.department || ''}`.toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) =>
          (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
        );
    },
    staleTime: 60_000,
  });
}
