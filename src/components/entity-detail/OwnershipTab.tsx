import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, GitBranch } from 'lucide-react';

interface OwnershipTabProps {
  entityId: string;
  entityName: string;
}

export default function OwnershipTab({ entityId, entityName }: OwnershipTabProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('entity_relationships' as any)
        .select('*')
        .eq('entity_id', entityId)
        .order('ownership_percentage', { ascending: false });
      setRows((data as any[]) || []);
      setLoading(false);
    })();
  }, [entityId]);

  const owners = rows.filter(r => r.ownership_percentage != null && r.ownership_percentage > 0);
  const totalOwnership = owners.reduce((sum, r) => sum + (r.ownership_percentage || 0), 0);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><GitBranch className="h-5 w-5 text-primary" />Ownership Structure</CardTitle>
        </CardHeader>
        <CardContent>
          {owners.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No ownership data available. Add relationships with ownership percentages to see the structure.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Visual Tree */}
              <div className="flex flex-col items-center">
                <div className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm shadow-md">
                  {entityName}
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="flex flex-wrap justify-center gap-4">
                  {owners.map(r => (
                    <div key={r.id} className="flex flex-col items-center">
                      <div className="w-px h-4 bg-border" />
                      <div className="px-4 py-2 border rounded-lg bg-card text-center min-w-[140px] shadow-sm">
                        <p className="text-sm font-medium">{r.related_entity_name}</p>
                        <Badge variant="outline" className="mt-1 bg-info/10 text-info border-info/20">{r.ownership_percentage}%</Badge>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{r.relationship_type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Identified Ownership</span>
                  <span className="font-semibold">{totalOwnership}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(totalOwnership, 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
