import { objectRoute } from '@/lib/routes/objectRoutes';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import { stageLabel, useExaminations } from '@/hooks/useExaminations';

export function EntityExaminationsTab({ entityId }: { entityId: string }) {
  const { data: rows = [], isLoading } = useExaminations({ entity_id: entityId });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-end">
          <Button data-rbac="prudential_supervision.edit" asChild size="sm" variant="outline">
            <Link to={`/prudential/examinations?entity=${entityId}`}>
              <Plus className="h-4 w-4 mr-1" />New examination
            </Link>
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Findings</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="capitalize">{r.examination_type.replace('_', ' ')}</TableCell>
                  <TableCell><Badge variant="outline">{stageLabel(r.stage)}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.findings_count ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={objectRoute.examination(r.id)}><ExternalLink className="h-4 w-4" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No examinations.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
