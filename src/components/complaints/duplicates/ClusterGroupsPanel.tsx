import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Boxes, Users, AlertTriangle, ArrowRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClusterDetailDialog } from './ClusterDetailDialog';
import { seedClusters } from '@/pages/complaints/duplicates/seed';
import type { ClusterDimension, DuplicateCluster } from '@/pages/complaints/duplicates/types';

const dims: { key: ClusterDimension; label: string; icon: React.ReactNode }[] = [
  { key: 'institution', label: 'Institution', icon: <Building2 className="h-4 w-4" /> },
  { key: 'product', label: 'Product', icon: <Boxes className="h-4 w-4" /> },
  { key: 'intermediary', label: 'Intermediary', icon: <Users className="h-4 w-4" /> },
  { key: 'issue', label: 'Issue', icon: <AlertTriangle className="h-4 w-4" /> },
];

export function ClusterGroupsPanel() {
  const [tab, setTab] = useState<ClusterDimension>('institution');
  const [selected, setSelected] = useState<DuplicateCluster | null>(null);
  const [open, setOpen] = useState(false);

  const byDim = useMemo(() => seedClusters.filter(c => c.dimension === tab), [tab]);

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
              {byDim.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No clusters detected for this dimension.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {byDim.map(cl => (
                    <div key={cl.id} className="rounded-md border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{cl.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(cl.dateRange.from).toLocaleDateString()} → {new Date(cl.dateRange.to).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">{cl.count} complaints</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {cl.severityMix.high > 0 && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">High × {cl.severityMix.high}</Badge>}
                        {cl.severityMix.medium > 0 && <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Med × {cl.severityMix.medium}</Badge>}
                        {cl.severityMix.low > 0 && <Badge variant="outline">Low × {cl.severityMix.low}</Badge>}
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
