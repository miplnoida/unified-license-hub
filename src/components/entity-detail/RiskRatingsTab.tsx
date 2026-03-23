import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Loader2, ShieldAlert, TrendingUp } from 'lucide-react';

export default function RiskRatingsTab({ entityId }: { entityId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ overall_rating: 'medium', risk_score: '50', assessment_date: new Date().toISOString().slice(0, 10), notes: '', mitigation_measures: '' });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('risk_ratings' as any).select('*').eq('entity_id', entityId).order('assessment_date', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [entityId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('risk_ratings' as any).insert({
      entity_id: entityId,
      overall_rating: form.overall_rating,
      risk_score: parseFloat(form.risk_score) || 50,
      assessment_date: form.assessment_date,
      notes: form.notes || null,
      mitigation_measures: form.mitigation_measures || null,
    });
    if (error) toast.error(error.message); else { toast.success('Risk assessment added'); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const latest = rows[0];
  const ratingColor = (r: string) => r === 'high' ? 'bg-destructive/10 text-destructive border-destructive/20' : r === 'medium' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-200';

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Current Rating */}
      {latest && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldAlert className="h-5 w-5 text-primary" />Current Risk Assessment</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Overall Rating</p>
                <Badge className={`text-lg px-4 py-1 ${ratingColor(latest.overall_rating)}`}>{latest.overall_rating?.toUpperCase()}</Badge>
              </div>
              <div className="text-center p-6 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Risk Score</p>
                <p className="text-3xl font-bold">{latest.risk_score}<span className="text-sm text-muted-foreground">/100</span></p>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${Number(latest.risk_score) > 70 ? 'bg-destructive' : Number(latest.risk_score) > 40 ? 'bg-warning' : 'bg-emerald-500'}`} style={{ width: `${latest.risk_score}%` }} />
                </div>
              </div>
              <div className="text-center p-6 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Assessment Date</p>
                <p className="text-lg font-semibold">{new Date(latest.assessment_date).toLocaleDateString()}</p>
              </div>
            </div>
            {latest.notes && <div className="mt-4 p-3 bg-muted/30 rounded-lg"><p className="text-sm text-muted-foreground">Notes:</p><p className="text-sm mt-1">{latest.notes}</p></div>}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-primary" />Assessment History</CardTitle>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />New Assessment</Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No risk assessments recorded.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Rating</TableHead><TableHead>Score</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.assessment_date).toLocaleDateString()}</TableCell>
                    <TableCell><Badge variant="outline" className={`capitalize ${ratingColor(r.overall_rating)}`}>{r.overall_rating}</Badge></TableCell>
                    <TableCell className="font-mono">{r.risk_score}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Risk Assessment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Overall Rating</Label><Select value={form.overall_rating} onValueChange={v => setForm(f => ({ ...f, overall_rating: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Risk Score (0-100)</Label><Input type="number" min="0" max="100" value={form.risk_score} onChange={e => setForm(f => ({ ...f, risk_score: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Assessment Date</Label><Input type="date" value={form.assessment_date} onChange={e => setForm(f => ({ ...f, assessment_date: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Mitigation Measures</Label><Textarea value={form.mitigation_measures} onChange={e => setForm(f => ({ ...f, mitigation_measures: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
