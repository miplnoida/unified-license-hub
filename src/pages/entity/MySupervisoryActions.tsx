/**
 * Licensee-facing supervisory action remediation workbench.
 *
 * Submission is performed by `submit_prudential_action_response`, which verifies
 * the caller belongs to the regulated entity server-side.
 */
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import {
  useMySupervisoryActions,
  useSubmitActionResponse,
} from '@/hooks/usePrudentialActionLifecycle';

export default function MySupervisoryActions() {
  const { data = [], isLoading } = useMySupervisoryActions();
  const submit = useSubmitActionResponse();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [narrative, setNarrative] = useState('');

  const outstanding = data.filter((a: any) => !['completed', 'waived', 'cancelled'].includes(a.status));
  const closed = data.filter((a: any) => ['completed', 'waived', 'cancelled'].includes(a.status));

  return (
    <DashboardLayout>
      <PageHeader
        title="Supervisory Actions"
        description="Remediation actions issued by your regulator. Submit your response and evidence before the due date."
      />

      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}

      <Card>
        <CardHeader><CardTitle>Outstanding ({outstanding.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {outstanding.length === 0 && <p className="text-sm text-muted-foreground">No outstanding supervisory actions.</p>}
          {outstanding.map((a: any) => (
            <div key={a.id} className="rounded border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{a.action_reference}</div>
                  <div className="font-medium">{a.title}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{a.status}</Badge>
                  <Badge>{a.severity}</Badge>
                </div>
              </div>
              {a.description && <p className="text-sm whitespace-pre-wrap">{a.description}</p>}
              <div className="text-xs text-muted-foreground">
                Due {a.due_date ?? '—'} · Evidence {a.evidence_required ? 'required' : 'not required'} · Review {a.review_status}
              </div>

              {openFor === a.id ? (
                <div className="space-y-2">
                  <Label>Your response <span className="text-destructive">*</span></Label>
                  <Textarea rows={4} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
                  <div className="flex gap-2">
                    <Button data-rbac="licensee_management.edit"
                      size="sm"
                      disabled={narrative.trim().length < 5 || submit.isPending}
                      onClick={() =>
                        submit.mutate(
                          { action_id: a.id, narrative },
                          { onSuccess: () => { setOpenFor(null); setNarrative(''); } },
                        )
                      }
                    >
                      {submit.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      Submit response
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenFor(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button data-rbac="licensee_management.edit" size="sm" variant="outline" onClick={() => { setOpenFor(a.id); setNarrative(''); }}>
                  Respond
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Closed ({closed.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {closed.length === 0 && <p className="text-sm text-muted-foreground">Nothing closed yet.</p>}
          {closed.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between text-sm border-b pb-1">
              <span><span className="font-mono text-xs text-muted-foreground mr-2">{a.action_reference}</span>{a.title}</span>
              <Badge variant="outline">{a.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
