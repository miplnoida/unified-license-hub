import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CalendarClock, MessageSquarePlus, Loader2, Trash2, ExternalLink,
  AlertTriangle, Gavel, FolderOpen, Dot,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  fmtDate, groupTimelineByYear, iso, type TimelineEvent,
} from '@/lib/conduct/supervisionLoop';
import { useSaveAnnotation, useDeleteAnnotation } from '@/hooks/useSupervisionLoop';

const KIND_META: Record<string, { icon: JSX.Element; tone: string; label: string }> = {
  complaint: { icon: <Dot className="h-5 w-5" />, tone: 'bg-primary/10 text-primary border-primary/30', label: 'Complaint' },
  investigation: { icon: <FolderOpen className="h-3.5 w-3.5" />, tone: 'bg-secondary text-secondary-foreground border-border', label: 'Investigation' },
  enforcement: { icon: <Gavel className="h-3.5 w-3.5" />, tone: 'bg-destructive/10 text-destructive border-destructive/30', label: 'Enforcement' },
  monitoring: { icon: <AlertTriangle className="h-3.5 w-3.5" />, tone: 'bg-accent text-accent-foreground border-border', label: 'Monitoring trigger' },
  annotation: { icon: <MessageSquarePlus className="h-3.5 w-3.5" />, tone: 'bg-muted text-muted-foreground border-border', label: 'Supervisor note' },
};

const ZOOMS = [
  { key: 'all', label: 'Full history' },
  { key: '24', label: 'Last 24 months' },
  { key: '12', label: 'Last 12 months' },
  { key: '6', label: 'Last 6 months' },
];

interface Props {
  entityId: string | null;
  entityName: string;
  events: TimelineEvent[];
  isLoading: boolean;
  canAnnotate: boolean;
}

export function EntityConductTimeline({ entityId, entityName, events, isLoading, canAnnotate }: Props) {
  const [zoom, setZoom] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ event_date: iso(new Date()), label: '', note: '' });
  const save = useSaveAnnotation();
  const del = useDeleteAnnotation();

  const cutoff = zoom === 'all' ? null : new Date(Date.now() - Number(zoom) * 30 * 86400000);
  const shown = cutoff ? events.filter((e) => new Date(e.occurred_at) >= cutoff) : events;
  const grouped = groupTimelineByYear(shown);

  const submit = async () => {
    if (!entityId || !form.label.trim()) {
      toast({ title: 'Label required', description: 'Give the annotation a short label.', variant: 'destructive' });
      return;
    }
    try {
      await save.mutateAsync({
        licensee_id: entityId, event_date: form.event_date,
        label: form.label.trim(), note: form.note.trim() || null,
      });
      toast({ title: 'Annotation added' });
      setForm({ event_date: iso(new Date()), label: '', note: '' });
      setOpen(false);
    } catch (e) {
      toast({ title: 'Could not save annotation', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Entity Conduct Timeline
            {entityId && <span className="text-xs font-normal text-muted-foreground">{entityName}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={zoom} onValueChange={setZoom}>
              <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ZOOMS.map((z) => <SelectItem key={z.key} value={z.key}>{z.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {canAnnotate && entityId && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button data-rbac="market_conduct.manage_complaints" size="sm" variant="outline">
                    <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> Annotate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add supervisory annotation</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="ann-date">Date</Label>
                      <Input id="ann-date" type="date" value={form.event_date}
                        onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="ann-label">Label</Label>
                      <Input id="ann-label" value={form.label} placeholder="e.g. Remediation plan agreed"
                        onChange={(e) => setForm({ ...form, label: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="ann-note">Narrative (optional)</Label>
                      <Textarea id="ann-note" rows={4} value={form.note}
                        onChange={(e) => setForm({ ...form, note: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button data-rbac="market_conduct.manage_complaints" onClick={submit} disabled={save.isPending}>
                      {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!entityId ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Select a single entity to view its conduct timeline.
          </p>
        ) : isLoading ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No conduct events in this window.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => (
              <div key={g.year}>
                <div className="text-xs font-semibold text-muted-foreground font-mono mb-2">{g.year}</div>
                <ol className="relative border-l border-border pl-4 space-y-2">
                  {g.events.map((e) => {
                    const meta = KIND_META[e.kind] ?? KIND_META.annotation;
                    return (
                      <li key={`${e.kind}-${e.id}`} className="relative">
                        <span className={`absolute -left-[26px] top-1 flex h-5 w-5 items-center justify-center rounded-full border ${meta.tone}`}>
                          {meta.icon}
                        </span>
                        <div className="rounded-md border border-border p-2 hover:bg-accent/40 transition-colors">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">{fmtDate(e.occurred_at)}</span>
                            {e.ref && <span className="text-xs font-mono">{e.ref}</span>}
                            {e.status && <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>}
                            {e.severity && <Badge variant="outline" className="text-[10px]">{e.severity}</Badge>}
                            {e.ended_at && (
                              <span className="text-[11px] text-muted-foreground">closed {fmtDate(e.ended_at)}</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              {e.href && (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={e.href}><ExternalLink className="h-3.5 w-3.5" /></Link>
                                </Button>
                              )}
                              {e.kind === 'annotation' && canAnnotate && (
                                <Button variant="ghost" size="sm" onClick={() => del.mutate(e.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-sm mt-1">{e.label}</div>
                          {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
