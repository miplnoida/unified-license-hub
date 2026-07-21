import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Sparkles, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  useRoles, useAllRolePermissions, usePermissions,
  type DynamicRole, type Permission,
} from '@/hooks/useRoles';
import { useAuth } from '@/contexts/AuthContext';

import { classifyRole, ROLE_CATEGORY_LABELS, type RoleCategory } from '@/lib/rbac/roleClassification';
import { buildRoleSummary } from '@/lib/rbac/roleSummary';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Super-admin only. Backfills `role_category`, `access_summary` and inserts
 * an audit row in `role_migration_log` for each existing role. Uses only the
 * classification/summary computed on the client from the role's current
 * granular permission set — no permission changes are ever written.
 */
export function RoleMigrationRunnerDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: allRolePerms = [] } = useAllRolePermissions();
  const { data: permissions = [] } = usePermissions();
  const { user } = useAuth();
  const isSuperAdmin = (user?.role as string) === 'super_admin';


  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ id: string; category: RoleCategory; changed: boolean }[]>([]);

  const proposals = useMemo(() => {
    return roles.map((role) => {
      const permIds = allRolePerms.filter(rp => rp.role_id === role.id).map(rp => rp.permission_id);
      const classification = classifyRole(permIds, permissions as Permission[]);
      const summary = buildRoleSummary(permIds, permissions as Permission[]);
      const currentCategory = (role as DynamicRole).role_category;
      return {
        role,
        classification,
        summary,
        permIds,
        needsUpdate:
          currentCategory !== classification.category ||
          Object.keys((role as any).access_summary ?? {}).length === 0,
      };
    });
  }, [roles, allRolePerms, permissions]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllNeeding = () => {
    const ids = proposals.filter(p => p.needsUpdate).map(p => p.role.id);
    const allOn = ids.every(id => selected.has(id));
    setSelected(allOn ? new Set() : new Set(ids));
  };

  const run = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super administrators can run the classification migration.');
      return;
    }
    if (selected.size === 0) {
      toast.info('Nothing selected.');
      return;
    }
    setRunning(true);
    setDone([]);
    const targets = proposals.filter(p => selected.has(p.role.id));
    const results: typeof done = [];
    for (let i = 0; i < targets.length; i++) {
      const { role, classification, summary, permIds } = targets[i];
      try {
        const { error: uErr } = await supabase
          .from('roles' as any)
          .update({
            role_category: classification.category,
            access_summary: {
              can: summary.can,
              cannot: summary.cannot,
              perModule: classification.perModule,
              sensitive: classification.sensitive,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', role.id);
        if (uErr) throw uErr;

        const { error: lErr } = await supabase.from('role_migration_log' as any).insert({
          role_id: role.id,
          classified_category: classification.category,
          matched_template: null,
          is_custom: classification.isCustom,
          custom_reason: classification.reason ?? null,
          per_module_levels: classification.perModule,
          sensitive_actions: classification.sensitive,
          run_by: user?.id ?? null,
        });
        if (lErr) throw lErr;
        results.push({ id: role.id, category: classification.category, changed: true });
      } catch (e: any) {
        toast.error(`Failed on ${role.name}: ${e.message ?? e}`);
        results.push({ id: role.id, category: classification.category, changed: false });
      }
      setProgress(Math.round(((i + 1) / targets.length) * 100));
      setDone([...results]);
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
    toast.success(`Classified ${results.filter(r => r.changed).length} of ${targets.length} role(s).`);
  };

  const needingCount = proposals.filter(p => p.needsUpdate).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100%-1rem)] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Classify existing roles
          </DialogTitle>
          <DialogDescription>
            Automatically fill in each role's business category and human-readable "Can / Cannot" summary
            based on its current permissions. This never changes permissions — only metadata.
          </DialogDescription>
        </DialogHeader>

        {!isSuperAdmin && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Super administrator required</AlertTitle>
            <AlertDescription>Only super administrators can run this migration.</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-2 py-2 shrink-0">
          <div className="text-sm text-muted-foreground">
            {needingCount === 0
              ? 'All roles already classified.'
              : `${needingCount} role${needingCount === 1 ? '' : 's'} need${needingCount === 1 ? 's' : ''} classification.`}
          </div>
          <Button variant="outline" size="sm" onClick={toggleAllNeeding} disabled={running || needingCount === 0}>
            {selected.size > 0 ? 'Clear selection' : 'Select all needing update'}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border rounded-md divide-y">
          {proposals.map(({ role, classification, needsUpdate }) => {
            const current = (role as DynamicRole).role_category;
            const isSel = selected.has(role.id);
            const result = done.find(d => d.id === role.id);
            return (
              <label
                key={role.id}
                className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 ${isSel ? 'bg-muted/30' : ''}`}
              >
                <Checkbox
                  checked={isSel}
                  disabled={running || !isSuperAdmin}
                  onCheckedChange={() => toggle(role.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{role.name}</span>
                    {role.is_system && <Badge variant="outline" className="text-[10px]">System</Badge>}
                    {classification.isCustom && <Badge variant="outline" className="text-[10px]">Custom mix</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Current: <span className="font-medium">{current ? ROLE_CATEGORY_LABELS[current as RoleCategory] : '—'}</span>
                    {' → '}Proposed: <span className="font-medium">{ROLE_CATEGORY_LABELS[classification.category]}</span>
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {result?.changed && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {needsUpdate ? (
                    <Badge variant="secondary" className="text-[10px]">Needs update</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Up to date</Badge>
                  )}
                </div>
              </label>
            );
          })}
          {proposals.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">No roles found.</p>
          )}
        </div>

        {running && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-[11px] text-muted-foreground">Applying classification…</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={run} disabled={running || selected.size === 0 || !isSuperAdmin}>
            {running ? 'Running…' : `Classify ${selected.size || ''} role${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
