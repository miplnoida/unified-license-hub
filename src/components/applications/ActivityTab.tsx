import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, History } from 'lucide-react';
import { getAuditDescriptor, CATEGORY_CLASSES } from '@/lib/auditLabels';

interface Row {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  new_value: any;
  metadata: any;
  user_email?: string;
}

export function ActivityTab({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Match rows tied to this application via entity_id OR metadata.application_id
      const [byEntity, byMeta] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, action, created_at, user_id, new_value, metadata')
          .eq('entity_type', 'application')
          .eq('entity_id', applicationId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('audit_logs')
          .select('id, action, created_at, user_id, new_value, metadata')
          .filter('metadata->>application_id', 'eq', applicationId)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      const map = new Map<string, Row>();
      [...(byEntity.data || []), ...(byMeta.data || [])].forEach((r: any) => map.set(r.id, r));
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Resolve actor emails
      const userIds = [...new Set(merged.map((r) => r.user_id).filter(Boolean))] as string[];
      let emailMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, email, full_name').in('id', userIds);
        profiles?.forEach((p: any) => {
          emailMap[p.id] = p.full_name || p.email || p.id;
        });
      }
      if (!cancelled) {
        setRows(merged.map((r) => ({ ...r, user_email: r.user_id ? emailMap[r.user_id] : 'System' })));
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <Card><CardContent className="py-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Activity Trail</h3>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <ol className="relative border-l border-border pl-5 space-y-4">
          {rows.map((r) => {
            const d = getAuditDescriptor(r.action);
            const comments =
              r.new_value?.comments || r.new_value?.reason || r.metadata?.comments || r.metadata?.reason;
            const fromStatus = r.metadata?.from_status;
            const toStatus = r.metadata?.to_status || r.new_value?.status;
            return (
              <li key={r.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex items-center flex-wrap gap-2">
                  <Badge variant="outline" className={CATEGORY_CLASSES[d.category]}>{d.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  by <span className="text-foreground">{r.user_email || 'System'}</span>
                  {fromStatus && toStatus && (
                    <> · <span className="font-mono">{fromStatus}</span> → <span className="font-mono">{toStatus}</span></>
                  )}
                </div>
                {comments && (
                  <p className="text-sm mt-1 bg-muted/40 border border-border rounded px-2 py-1">
                    {String(comments)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
