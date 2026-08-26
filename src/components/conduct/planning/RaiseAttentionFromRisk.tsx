/**
 * MC-09 → MC-10 entry point.
 *
 * Turns a confirmed emerging conduct risk into a supervisory attention item so
 * that prioritisation, planning and intervention follow the governed route. The
 * supervisor writes the basis; the priority is calculated afterwards on the
 * attention item itself and must still be confirmed by a supervisor. Nothing is
 * created automatically here.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import {
  ATTENTION_STATUS_LABEL, MATERIALITY_LABEL, PRIORITY_BAND_LABEL, URGENCY_LABEL,
  attentionErrorMessage, useAttentionRegister, useCreateAttention,
} from '@/hooks/useConductAttention';

interface Props {
  risk: {
    id: string;
    reference: string;
    title: string;
    status: string;
    severity: string;
    thematic_scope?: string | null;
    sector_id?: string | null;
  };
  canOperate: boolean;
}

const SEVERITY_TO_MATERIALITY: Record<string, string> = {
  low: 'low', medium: 'medium', high: 'high', severe: 'severe', critical: 'severe',
};

export function RaiseAttentionFromRisk({ risk, canOperate }: Props) {
  const navigate = useNavigate();
  const create = useCreateAttention();
  const register = useAttentionRegister();

  const linked = (register.data?.attention_items ?? []).filter((a) => a.emerging_risk_id === risk.id);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(risk.title);
  const [basis, setBasis] = useState('');
  const [materiality, setMateriality] = useState(SEVERITY_TO_MATERIALITY[risk.severity] ?? 'medium');
  const [urgency, setUrgency] = useState('elevated');
  const [reviewDate, setReviewDate] = useState('');

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        sourceType: 'emerging_risk',
        sourceModule: 'market_conduct',
        supervisoryBasis: basis.trim(),
        sourceReference: risk.reference,
        emergingRiskId: risk.id,
        theme: risk.thematic_scope ?? null,
        sectorId: risk.sector_id ?? null,
        materiality,
        urgency,
        targetReviewDate: reviewDate || null,
      });
      toast.success(`Supervisory attention ${result.reference} raised from this risk.`);
      setOpen(false);
      navigate(`/conduct/attention/${result.id}`);
    } catch (e) {
      toast.error(attentionErrorMessage(String((e as Error)?.message ?? '')));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supervisory response</CardTitle>
        <CardDescription>
          A recorded risk only becomes supervisory work once an officer raises it for attention. Priority is then
          calculated on the attention item and must be confirmed by a supervisor before planning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No supervisory attention item has been raised from this risk yet.
          </p>
        ) : (
          <div className="space-y-2">
            {linked.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{a.reference}</p>
                  <p className="text-sm font-medium">{a.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ATTENTION_STATUS_LABEL[a.status]}</Badge>
                  {a.confirmed_priority && (
                    <Badge variant="secondary">{PRIORITY_BAND_LABEL[a.confirmed_priority]}</Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate(`/conduct/attention/${a.id}`)}>
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {canOperate && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Target className="mr-1.5 h-4 w-4" /> Raise for supervisory attention
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Raise this risk for supervisory attention</DialogTitle>
              <DialogDescription>
                The matter, its recorded materiality and urgency and your written basis are recorded against you.
                The deterministic priority is calculated afterwards from the records, and you confirm or override it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Matter</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Supervisory basis (at least 20 characters)</Label>
                <Textarea
                  rows={4}
                  value={basis}
                  onChange={(e) => setBasis(e.target.value)}
                  placeholder={`Why ${risk.reference} requires supervisory attention now.`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Materiality</Label>
                  <Select value={materiality} onValueChange={setMateriality}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(MATERIALITY_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Urgency</Label>
                  <Select value={urgency} onValueChange={setUrgency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(URGENCY_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target review date</Label>
                  <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={title.trim().length < 3 || basis.trim().length < 20 || create.isPending}
                onClick={submit}
              >
                {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Raise for attention
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
