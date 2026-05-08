import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';

interface Row {
  id: string;
  template_id: string;
  version_id: string;
  assigned_reason: string;
  assigned_at: string;
  status: string;
  template_name?: string | null;
  version_label?: string | null;
  version_status?: string | null;
}

interface Props {
  applicationId: string;
}

const REASON_LABELS: Record<string, string> = {
  latest_at_start: 'Latest at start',
  resumed_existing: 'Resumed existing',
  migrated_from_json: 'Migrated from legacy',
  admin_override: 'Admin override',
  legacy_backfill: 'Legacy backfill',
};

export function FormVersionAssignmentsPanel({ applicationId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: assignments } = await supabase
        .from('application_form_versions' as any)
        .select('id, template_id, version_id, assigned_reason, assigned_at, status')
        .eq('application_id', applicationId)
        .order('assigned_at', { ascending: false });
      const list = ((assignments || []) as any[]) as Row[];
      if (list.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      const tplIds = Array.from(new Set(list.map(r => r.template_id)));
      const verIds = Array.from(new Set(list.map(r => r.version_id)));
      const [{ data: tpls }, { data: vers }] = await Promise.all([
        supabase.from('form_templates').select('id, name').in('id', tplIds),
        supabase.from('form_versions').select('id, version, semantic_version, status').in('id', verIds),
      ]);
      const tplMap = new Map((tpls || []).map((t: any) => [t.id, t.name]));
      const verMap = new Map((vers || []).map((v: any) => [v.id, v]));
      const enriched = list.map(r => {
        const v: any = verMap.get(r.version_id);
        return {
          ...r,
          template_name: tplMap.get(r.template_id) || r.template_id,
          version_label: v ? `v${v.semantic_version || `${v.version}.0`}` : '—',
          version_status: v?.status ?? null,
        };
      });
      if (!cancelled) { setRows(enriched); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Form Version Assignments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border rounded-md p-2">
            <div className="flex flex-col">
              <span className="font-medium">{r.template_name}</span>
              <span className="text-xs text-muted-foreground">
                Assigned {new Date(r.assigned_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{r.version_label}</Badge>
              {r.version_status && (
                <Badge variant="outline" className="capitalize text-xs">{r.version_status}</Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {REASON_LABELS[r.assigned_reason] || r.assigned_reason}
              </Badge>
              {r.status !== 'active' && (
                <Badge variant="outline" className="capitalize text-xs">{r.status}</Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
