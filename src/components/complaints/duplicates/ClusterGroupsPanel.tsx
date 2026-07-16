import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Boxes, Users, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClusterDetailDialog, type ClusterRow } from './ClusterDetailDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClusterDimension } from '@/pages/complaints/duplicates/types';

const dims: { key: ClusterDimension; label: string; icon: React.ReactNode }[] = [
  { key: 'institution', label: 'Institution', icon: <Building2 className="h-4 w-4" /> },
  { key: 'product', label: 'Product', icon: <Boxes className="h-4 w-4" /> },
  { key: 'intermediary', label: 'Intermediary', icon: <Users className="h-4 w-4" /> },
  { key: 'issue', label: 'Issue', icon: <AlertTriangle className="h-4 w-4" /> },
];

export function ClusterGroupsPanel() {
  const [tab, setTab] = useState<ClusterDimension>('institution');
  const [selected, setSelected] = useState<ClusterRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: clusters = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['list_duplicate_clusters', tab],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_duplicate_clusters', { _dimension: tab });
      if (error) throw error;
      return (data ?? []) as ClusterRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Complaint Clusters</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ClusterDimension)}>
          <TabsList>
            {dims.map(d => (
              <TabsTrigger key={d.key} value={d.key} className="gap-2">{d.icon}{d.label}</TabsTrigger>
            ))}
          </TabsList>
          {dims.map(d => (
            <TabsContent key={d.key} value={d.key} className="mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : isError ? (
                <div className="py-6 text-center space-y-2">
                  <p className="text-sm text-destructive">Unable to load clusters.</p>
                  <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
                </div>
              ) : clusters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No clusters detected for this dimension.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {clusters.map(cl => (
                    <div key={cl.id} className="rounded-md border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium truncate">{cl.key ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">Detected {new Date(cl.updated_at ?? cl.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">{(cl.member_ids ?? []).length} complaints</Badge>
                      </div>
                      <div className="pt-1">
                        <Button size="sm" variant="ghost" className="px-0 h-auto" onClick={() => { setSelected(cl); setOpen(true); }}>
                          View complaints <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <ClusterDetailDialog cluster={selected} open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}
