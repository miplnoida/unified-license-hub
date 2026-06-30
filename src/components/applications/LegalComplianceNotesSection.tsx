import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Scale, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLegalNotes,
  useLegalNotesAccess,
  useCreateLegalNote,
  type LegalRecommendation,
  type LegalSeverity,
} from '@/hooks/useApplicationLegalNotes';

interface Props {
  applicationId: string;
  workflowInstanceId: string | null;
  currentStepId: string | null;
  currentStepIsLegal: boolean;
  workflowHasLegalStep: boolean;
  isLegalReviewer: boolean;
}

const RECOMMENDATION_LABELS: Record<LegalRecommendation, string> = {
  no_objection: 'No objection',
  approve_with_conditions: 'Approve with conditions',
  request_more_information: 'Request more information',
  escalate: 'Escalate',
  reject: 'Reject',
};

const SEVERITY_LABELS: Record<LegalSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function LegalComplianceNotesSection({
  applicationId,
  workflowInstanceId,
  currentStepId,
  currentStepIsLegal,
  workflowHasLegalStep,
  isLegalReviewer,
}: Props) {
  if (!workflowHasLegalStep) return null;

  // Probe access (also logs denial server-side if not allowed).
  const { data: allowed, isLoading: accessLoading } = useLegalNotesAccess(applicationId, true);
  const { data: notes = [], isLoading: notesLoading } = useLegalNotes(applicationId, !!allowed);
  const createNote = useCreateLegalNote(applicationId);

  const [noteText, setNoteText] = useState('');
  const [hasConcern, setHasConcern] = useState(false);
  const [severity, setSeverity] = useState<LegalSeverity | ''>('');
  const [conditions, setConditions] = useState('');
  const [recommendation, setRecommendation] = useState<LegalRecommendation | ''>('');

  if (accessLoading) return null;

  if (!allowed) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Restricted legal notes
        </CardContent>
      </Card>
    );
  }

  const canWrite = isLegalReviewer && currentStepIsLegal && !!currentStepId;

  const submit = async () => {
    if (!canWrite || !currentStepId) return;
    if (!noteText.trim()) { toast.error('Legal note text is required'); return; }
    if (!recommendation) { toast.error('Select a recommendation'); return; }
    if (hasConcern && !severity) { toast.error('Select severity for the flagged concern'); return; }
    try {
      await createNote.mutateAsync({
        workflow_instance_id: workflowInstanceId,
        step_id: currentStepId,
        note_text: noteText.trim(),
        has_legal_concern: hasConcern,
        concern_severity: hasConcern ? (severity as LegalSeverity) : null,
        recommended_conditions: conditions.trim() || null,
        recommendation: recommendation as LegalRecommendation,
      });
      toast.success('Legal note saved');
      setNoteText(''); setHasConcern(false); setSeverity(''); setConditions(''); setRecommendation('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save legal note');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          {canWrite ? 'Legal/Compliance Notes' : 'Legal/Compliance Review Summary'}
          <Badge variant="outline" className="ml-2 text-[10px]">Restricted</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canWrite && (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div>
              <Label htmlFor="legal-note-text" className="text-xs">Legal note</Label>
              <Textarea
                id="legal-note-text"
                rows={4}
                placeholder="Document legal/compliance observations..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                disabled={createNote.isPending}
              />
            </div>

            <div className="flex items-start gap-3">
              <Switch
                id="legal-concern"
                checked={hasConcern}
                onCheckedChange={v => setHasConcern(!!v)}
                disabled={createNote.isPending}
              />
              <div className="flex-1">
                <Label htmlFor="legal-concern" className="text-xs cursor-pointer">Flag legal concern</Label>
                <p className="text-[10px] text-muted-foreground">Raise visibility for downstream approvers.</p>
              </div>
            </div>

            {hasConcern && (
              <div>
                <Label className="text-xs">Concern severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as LegalSeverity)} disabled={createNote.isPending}>
                  <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SEVERITY_LABELS) as LegalSeverity[]).map(k => (
                      <SelectItem key={k} value={k}>{SEVERITY_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="legal-conditions" className="text-xs">Recommended conditions (optional)</Label>
              <Textarea
                id="legal-conditions"
                rows={2}
                placeholder="Conditions to attach if approved..."
                value={conditions}
                onChange={e => setConditions(e.target.value)}
                disabled={createNote.isPending}
              />
            </div>

            <div>
              <Label className="text-xs">Recommendation</Label>
              <Select value={recommendation} onValueChange={(v) => setRecommendation(v as LegalRecommendation)} disabled={createNote.isPending}>
                <SelectTrigger><SelectValue placeholder="Select recommendation" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECOMMENDATION_LABELS) as LegalRecommendation[]).map(k => (
                    <SelectItem key={k} value={k}>{RECOMMENDATION_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={submit} disabled={createNote.isPending}>
              {createNote.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Legal Note
            </Button>
            <p className="text-[10px] text-muted-foreground italic">
              Legal notes are advisory. They do not approve or reject the application — use the workflow action buttons.
            </p>
          </div>
        )}

        {canWrite && notes.length > 0 && <Separator />}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {notes.length === 0 ? 'No legal notes recorded yet.' : `Legal notes (${notes.length})`}
          </p>
          {notesLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {notes.map(n => (
            <div key={n.id} className="rounded-md border border-border/60 p-3 space-y-1 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{RECOMMENDATION_LABELS[n.recommendation]}</Badge>
                {n.has_legal_concern && (
                  <Badge variant="destructive">
                    Concern{n.concern_severity ? ` · ${SEVERITY_LABELS[n.concern_severity]}` : ''}
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{n.note_text}</p>
              {n.recommended_conditions && (
                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Recommended conditions</p>
                  <p className="whitespace-pre-wrap">{n.recommended_conditions}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
