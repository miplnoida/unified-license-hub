import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useExaminationEvents } from '@/hooks/useExaminations';

export function ExaminationTimeline({ examinationId }: { examinationId: string }) {
  const { data: rows = [], isLoading } = useExaminationEvents(examinationId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          <ol className="relative border-l pl-4 space-y-4">
            {rows.map((e: any) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{String(e.event_type ?? '').replace(/_/g, ' ')}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.notes && <p className="text-xs mt-1">{e.notes}</p>}
                {(e.from_stage || e.to_stage) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {String(e.from_stage ?? 'start').replace(/_/g, ' ')} → {String(e.to_stage ?? '').replace(/_/g, ' ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
