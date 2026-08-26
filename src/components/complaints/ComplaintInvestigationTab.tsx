/**
 * MC-03 — Complaint investigation workspace.
 *
 * Everything on this tab reads one governed read model
 * (`get_complaint_investigation_workspace`) and writes through governed RPCs.
 * Nothing here moves the complaint: the canonical Market Conduct workflow
 * advances on domain events (plan approval, allegation outcomes, readiness), so
 * the phase panel on "Current step" is read-only over the server's state.
 *
 * Order of work: gate → plan → allegations → evidence → representations →
 * work items → readiness → internal notes.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, Loader2, NotebookPen, ShieldAlert } from 'lucide-react';

import { SectionState } from '@/components/complaints/DataState';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime } from '@/lib/datetime';
import type { CaseWorkSection } from '@/lib/complaintWorkflow';
import {
  investigationOps,
  useInvestigationMutation,
  useInvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';
import { InvestigationPlanPanel } from '@/components/complaints/investigation/InvestigationPlanPanel';
import { AllegationsRegister } from '@/components/complaints/investigation/AllegationsRegister';
import { EvidenceWorkspace } from '@/components/complaints/investigation/EvidenceWorkspace';
import { RepresentationsPanel } from '@/components/complaints/investigation/RepresentationsPanel';
import { InvestigationTasksPanel } from '@/components/complaints/investigation/InvestigationTasksPanel';
import { InvestigationReadinessPanel } from '@/components/complaints/investigation/InvestigationReadinessPanel';

interface Props {
  complaintId: string;
  complaintStatus: string;
  onOpenSection?: (section: CaseWorkSection) => void;
}

export default function ComplaintInvestigationTab({ complaintId, onOpenSection }: Props) {
  const qc = useQueryClient();
  const workspaceQ = useInvestigationWorkspace(complaintId);
  const [noteBody, setNoteBody] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const notesQ = useQuery({
    queryKey: ['complaint_correspondence', complaintId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_correspondence')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const authorIds = Array.from(new Set((data ?? []).map((r: any) => r.author_id).filter(Boolean)));
      const map = new Map<string, string>();
      if (authorIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles').select('id, full_name, email').in('id', authorIds as string[]);
        if (profErr) throw profErr;
        (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.email));
      }
      return (data ?? []).map((r: any) => ({
        ...r, author_name: r.author_id ? map.get(r.author_id) || 'Staff' : 'System',
      }));
    },
  });

  const startMut = useInvestigationMutation(complaintId, () => investigationOps.investigationOpen(complaintId));
  const noteMut = useInvestigationMutation(complaintId, (body: string) =>
    investigationOps.complaintNoteAdd(complaintId, body),
  );

  const notes = useMemo(
    () => (notesQ.data ?? []).filter((r: any) => r.direction === 'internal_note'),
    [notesQ.data],
  );
  const historical = useMemo(
    () => (notesQ.data ?? []).filter((r: any) => r.direction !== 'internal_note'),
    [notesQ.data],
  );

  if (workspaceQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the investigation record…
        </CardContent>
      </Card>
    );
  }

  if (workspaceQ.isError || !workspaceQ.data) {
    return (
      <QueryErrorState
        title="We couldn’t load the investigation"
        message="The investigation record for this complaint could not be read. Please try again."
        onRetry={() => workspaceQ.refetch()}
      />
    );
  }

  const ws = workspaceQ.data;
  const gate = ws.gate;
  const investigationOpen = ws.complaint.status === 'under_investigation';

  return (
    <div className="space-y-4">
      {!gate.ok && (
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />Investigation cannot start yet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Jurisdiction and triage must be settled before case work begins. Clear the following first:
            </p>
            <ul className="space-y-1">
              {(gate.blockers ?? []).map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{b}
                </li>
              ))}
            </ul>
            {onOpenSection && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => onOpenSection('jurisdiction')}>Open jurisdiction</Button>
                <Button size="sm" variant="outline" onClick={() => onOpenSection('triage')}>Open triage</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {gate.ok && !investigationOpen && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open the investigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Jurisdiction and triage are settled{gate.investigation_scope ? `; the confirmed scope is ${gate.investigation_scope}` : ''}.
              Opening the investigation starts the case work record and moves the complaint into the investigation phase.
            </p>
            {ws.capabilities.can_start_investigation ? (
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                disabled={startMut.isPending}
                onClick={async () => {
                  try {
                    await startMut.mutateAsync(undefined as never);
                    toast.success('Investigation opened');
                  } catch (e: any) {
                    toast.error(e?.message ?? 'The investigation could not be opened');
                  }
                }}
              >
                {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Open the investigation
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                You do not hold the permission to open an investigation on this complaint.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <InvestigationPlanPanel complaintId={complaintId} workspace={ws} onOpenSection={onOpenSection} />
      <AllegationsRegister complaintId={complaintId} workspace={ws} />
      <EvidenceWorkspace complaintId={complaintId} workspace={ws} />
      <RepresentationsPanel complaintId={complaintId} workspace={ws} />
      <InvestigationTasksPanel complaintId={complaintId} workspace={ws} />
      <InvestigationReadinessPanel workspace={ws} onOpenSection={onOpenSection} />

      {/* Internal notes — governed insert only (complaint_note_add). */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><NotebookPen className="h-4 w-4" />Internal notes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Investigator notes for the case file. These are not shared with the complainant or the entity.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {ws.capabilities.can_add_note && (
            <div className="space-y-2 border-b pb-4">
              <Textarea
                aria-label="Internal note"
                rows={3}
                placeholder="Record what you did, what you found, or what you decided"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button
                data-rbac="complaint_management.edit"
                size="sm"
                disabled={noteMut.isPending || noteBody.trim().length < 3}
                onClick={async () => {
                  try {
                    await noteMut.mutateAsync(noteBody.trim());
                    setNoteBody('');
                    qc.invalidateQueries({ queryKey: ['complaint_correspondence', complaintId] });
                    toast.success('Internal note added');
                  } catch (e: any) {
                    toast.error(e?.message ?? 'The note could not be saved');
                  }
                }}
              >
                {noteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add note
              </Button>
            </div>
          )}

          <SectionState
            isLoading={notesQ.isLoading}
            isError={notesQ.isError}
            isEmpty={notes.length === 0}
            noun="internal notes"
            onRetry={() => notesQ.refetch()}
            emptyText="No internal notes have been recorded yet."
          >
            <ul className="space-y-2">
              {notes.map((n: any) => (
                <li key={n.id} className="rounded-md border p-3">
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n.author_name} · {formatDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </SectionState>

          {historical.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 text-xs">
                  Correspondence on this case ({historical.length})
                  <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {historical.map((c: any) => (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {c.direction === 'outbound' ? 'Sent by the regulator' : 'Received'}
                      </Badge>
                      {c.subject && <p className="text-sm font-medium">{c.subject}</p>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.author_name} · {formatDateTime(c.created_at)}
                    </p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
