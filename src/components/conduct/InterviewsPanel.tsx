import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInterviews, type ConductInterview } from '@/hooks/useConductInterviews';
import { InterviewRecordDialog } from './InterviewRecordDialog';
import { Loader2, Plus, Mic, Lock, PenLine, Ban } from 'lucide-react';

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'outline',
  conducted: 'secondary',
  recorded: 'default',
  cancelled: 'destructive',
};

function AttestationBadge({ row }: { row: ConductInterview }) {
  if (row.attestation_outcome === 'signed') {
    return <Badge variant="default" className="gap-1"><PenLine className="h-3 w-3" />Signed</Badge>;
  }
  if (row.attestation_outcome === 'refused') {
    return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />Refused</Badge>;
  }
  if (row.attestation_outcome === 'not_required') {
    return <Badge variant="secondary">Not required</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}

export function InterviewsPanel({
  investigationId,
  entityId,
}: {
  investigationId: string;
  entityId?: string | null;
}) {
  const { data, isLoading } = useInterviews(investigationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ConductInterview | null>(null);
  const rows = data ?? [];

  const conducted = rows.filter(r => r.status === 'conducted' || r.status === 'recorded').length;
  const pendingSig = rows.filter(r => r.attestation_outcome === 'pending' && r.status !== 'cancelled').length;
  const refusals = rows.filter(r => r.attestation_outcome === 'refused').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="h-4 w-4" />Interview records ({rows.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {conducted} conducted · {pendingSig} pending signature · {refusals} refusal{refusals === 1 ? '' : 's'}
          </p>
        </div>
        <Button data-rbac="market_conduct.edit" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Add interview
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interviewee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attestation</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      No interviews recorded for this investigation.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {row.finalised_at && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Finalised" />}
                        <span>{row.interviewee_name}</span>
                      </div>
                      {row.interviewee_role && (
                        <div className="text-xs text-muted-foreground">{row.interviewee_role}{row.interviewee_organisation ? ` · ${row.interviewee_organisation}` : ''}</div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{row.interview_type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[row.status] ?? 'outline'} className="capitalize">{row.status}</Badge>
                    </TableCell>
                    <TableCell><AttestationBadge row={row} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <InterviewRecordDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        investigationId={investigationId}
        entityId={entityId}
      />
      <InterviewRecordDialog
        mode="edit"
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        investigationId={investigationId}
        entityId={entityId}
        interview={selected ?? undefined}
      />
    </Card>
  );
}
