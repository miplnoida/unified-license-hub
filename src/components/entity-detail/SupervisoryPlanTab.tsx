import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Clock, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  status: string;
  created_from: string;
  notes: string | null;
  risk_rating_id: string | null;
  created_at: string;
}

interface Action {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  owner_role: string | null;
  due_date: string;
  status: string;
  completed_at: string | null;
  source: string;
}

interface RiskRating {
  id: string;
  overall_rating: string;
  risk_score: number;
  notes: string | null;
}

export default function SupervisoryPlanTab({ entityId }: { entityId: string }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [rating, setRating] = useState<RiskRating | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newOwner, setNewOwner] = useState('supervisor');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: p } = await supabase
      .from('supervisory_plans' as any)
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPlan((p as any) || null);
    if (p) {
      const [actsRes, ratingRes] = await Promise.all([
        supabase.from('supervisory_plan_actions' as any).select('*').eq('plan_id', (p as any).id).order('due_date'),
        (p as any).risk_rating_id
          ? supabase.from('risk_ratings' as any).select('id, overall_rating, risk_score, notes').eq('id', (p as any).risk_rating_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setActions(((actsRes.data as any) || []) as Action[]);
      setRating((ratingRes.data as any) || null);
    } else {
      setActions([]);
      setRating(null);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  const bootstrap = async () => {
    // Look up license id for this entity
    const { data: lic } = await supabase.from('licensees').select('license_id').eq('id', entityId).maybeSingle();
    if (!lic?.license_id) { toast.error('Licensee has no associated license'); return; }
    const { error } = await supabase.rpc('bootstrap_supervisory_profile' as any, { _license_id: lic.license_id });
    if (error) { toast.error(error.message); return; }
    toast.success('Supervisory profile generated');
    load();
  };

  const markComplete = async (a: Action) => {
    const { error } = await supabase
      .from('supervisory_plan_actions' as any)
      .update({ status: 'completed', completed_at: new Date().toISOString() } as any)
      .eq('id', a.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Action completed');
    load();
  };

  const addAction = async () => {
    if (!plan || !newTitle.trim() || !newDue) {
      toast.error('Title and due date are required');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('supervisory_plan_actions' as any).insert({
      plan_id: plan.id,
      title: newTitle.trim(),
      description: newDescription || null,
      owner_role: newOwner,
      due_date: newDue,
      source: 'manual',
    } as any);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setAddOpen(false);
    setNewTitle(''); setNewDescription(''); setNewDue(''); setNewOwner('supervisor');
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <ShieldIcon />
          <p className="text-muted-foreground">No supervisory plan exists yet for this licensee.</p>
          <Button onClick={bootstrap}><Plus className="h-4 w-4 mr-1" />Generate Initial Supervisory Profile</Button>
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Supervisory Plan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="capitalize">{plan.status}</Badge></div>
            <div><span className="text-muted-foreground">Created from:</span> <span className="capitalize">{plan.created_from}</span></div>
            <div><span className="text-muted-foreground">Created:</span> {new Date(plan.created_at).toLocaleDateString()}</div>
            {plan.notes && <p className="text-muted-foreground italic">"{plan.notes}"</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Initial Risk Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rating ? (
              <>
                <div><span className="text-muted-foreground">Overall:</span> <Badge variant="outline" className="capitalize">{rating.overall_rating}</Badge></div>
                <div><span className="text-muted-foreground">Score:</span> {rating.risk_score}</div>
                {rating.notes && <p className="text-muted-foreground">{rating.notes}</p>}
              </>
            ) : <p className="text-muted-foreground">No risk rating linked.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Time-Bound Corrective Actions</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Action</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Corrective Action</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title *</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} /></div>
                <div><Label>Description</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Owner Role</Label><Input value={newOwner} onChange={e => setNewOwner(e.target.value)} /></div>
                  <div><Label>Due Date *</Label><Input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={addAction} disabled={submitting || !newTitle || !newDue}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No actions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map(a => {
                  const overdue = a.status !== 'completed' && a.due_date < today;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.title}</div>
                        {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                      </TableCell>
                      <TableCell className="capitalize text-sm">{a.owner_role || '—'}</TableCell>
                      <TableCell className="text-sm">{new Date(a.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {a.status === 'completed' ? (
                          <Badge variant="default" className="bg-success/15 text-success border-success/40"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>
                        ) : overdue ? (
                          <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>
                        ) : (
                          <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{a.source}</TableCell>
                      <TableCell className="text-right">
                        {a.status !== 'completed' && (
                          <Button size="sm" variant="outline" onClick={() => markComplete(a)}>Mark complete</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShieldIcon() {
  return (
    <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
      <AlertTriangle className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}
