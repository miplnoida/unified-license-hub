import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitCompareArrows, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface LineageEvent {
  source: string;
  event_at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  changed_fields: string[] | null;
  justification: string | null;
  metadata: Record<string, unknown> | null;
}

interface Props {
  /** Pre-fill and lock the object type (e.g. 'applications'). */
  objectType?: string;
  /** Pre-fill and lock the record id. */
  objectId?: string;
  /** Hide the lookup inputs when the caller already knows the record. */
  embedded?: boolean;
  title?: string;
}

const fmt = (v: string) => new Date(v).toISOString().replace('T', ' ').slice(0, 19);

const val = (v: unknown) =>
  v === null || v === undefined
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v);

export function LineageViewer({ objectType = '', objectId = '', embedded = false, title = 'Data lineage' }: Props) {
  const [type, setType] = useState(objectType);
  const [id, setId] = useState(objectId);
  const [rows, setRows] = useState<LineageEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async (t = type, i = id) => {
    if (!t.trim() || !i.trim()) {
      toast.error('Object type and record ID are both required');
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('record_lineage', {
        _object_type: t.trim(),
        _object_id: i.trim(),
        _limit: 200,
      });
      if (error) throw error;
      setRows((data ?? []) as LineageEvent[]);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load lineage');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!embedded && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <Label>Object type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. applications" />
            </div>
            <div className="min-w-[280px] flex-1">
              <Label>Record ID</Label>
              <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="UUID or reference" />
            </div>
            <Button data-rbac="audit_management.export" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Trace lineage
            </Button>
          </div>
        )}

        {embedded && !loaded && (
          <Button data-rbac="audit_management.export" onClick={() => load(objectType, objectId)} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Load lineage
          </Button>
        )}

        {loaded && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No recorded changes for this record. Lineage appears once the record is created or modified through the platform.
          </p>
        )}

        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div key={`${r.source}-${r.event_at}-${idx}`} className="border rounded-md p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{fmt(r.event_at)}</span>
                <Badge variant="outline">{r.source}</Badge>
                {r.action && <Badge variant="secondary">{r.action}</Badge>}
                <span>· {r.actor_role ?? 'system'}</span>
                {r.actor_id && <span className="font-mono">{r.actor_id.slice(0, 8)}</span>}
              </div>

              {(r.changed_fields?.length ?? 0) > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">Field</th>
                        <th className="py-1 pr-3 font-medium">Before</th>
                        <th className="py-1 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.changed_fields!.map((f) => (
                        <tr key={f} className="border-t border-border/60 align-top">
                          <td className="py-1 pr-3 font-mono">{f}</td>
                          <td className="py-1 pr-3 break-all text-muted-foreground">
                            {val((r.before_value ?? {})[f])}
                          </td>
                          <td className="py-1 break-all">{val((r.after_value ?? {})[f])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No field-level differences recorded for this event.</p>
              )}

              {r.justification && (
                <p className="text-xs italic text-muted-foreground mt-2">Justification: {r.justification}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default LineageViewer;
