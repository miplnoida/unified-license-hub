/**
 * P04 A.6 — licence variation with an itemised before/after change set.
 *
 * Opening and deciding a variation go through `license_variation_operation()`,
 * which enforces licence state, a rationale, maker/checker separation and the
 * fee/verification gates before a variation can be approved.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GitCompareArrows, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { LicenseVariationCase, useLicenseVariationOperation, useLicenseVariations } from '@/hooks/useLicenseP04Extensions';

const VARIATION_TYPES = [
  'scope_of_activities', 'licence_conditions', 'trading_name', 'registered_address',
  'ownership_or_control', 'key_function_holder', 'other',
];

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-muted text-muted-foreground',
  under_assessment: 'bg-primary/10 text-primary border-primary/20',
  approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  refused: 'bg-destructive/10 text-destructive border-destructive/20',
  withdrawn: 'bg-muted text-muted-foreground',
};

interface DraftItem { field_key: string; label: string; current_value: string; requested_value: string }

export default function LicenseVariationPanel({ licenseId }: { licenseId: string }) {
  const { data, isLoading } = useLicenseVariations(licenseId);
  const op = useLicenseVariationOperation(licenseId);

  const [openDialog, setOpenDialog] = useState(false);
  const [variationType, setVariationType] = useState(VARIATION_TYPES[0]);
  const [rationale, setRationale] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ field_key: '', label: '', current_value: '', requested_value: '' }]);

  const [decide, setDecide] = useState<LicenseVariationCase | null>(null);
  const [decision, setDecision] = useState('approved');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');

  const resetOpen = () => {
    setOpenDialog(false); setRationale('');
    setItems([{ field_key: '', label: '', current_value: '', requested_value: '' }]);
  };

  const submitOpen = async () => {
    try {
      await op.mutateAsync({
        operation: 'open',
        payload: {
          license_id: licenseId,
          variation_type: variationType,
          rationale,
          items: items
            .filter((i) => i.requested_value.trim())
            .map((i) => ({
              field_key: i.field_key.trim() || 'change',
              label: i.label.trim() || i.field_key.trim() || 'Change',
              current_value: i.current_value,
              requested_value: i.requested_value,
            })),
        },
      });
      toast.success('Variation matter opened.');
      resetOpen();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The server refused this variation.');
    }
  };

  const submitDecision = async () => {
    if (!decide) return;
    try {
      await op.mutateAsync({
        operation: 'decide',
        payload: {
          variation_id: decide.variation.id,
          decision,
          rationale: decisionRationale,
          effective_date: effectiveDate || null,
        },
      });
      toast.success('Variation decision recorded.');
      setDecide(null); setDecisionRationale(''); setEffectiveDate('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The server refused this decision.');
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-primary" />Variations
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpenDialog(true)}>Open variation</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No variation has been requested for this licence.</p>
        )}

        {rows.map((v) => (
          <div key={v.variation.id} className="rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
              <div>
                <p className="font-mono text-sm font-medium text-primary">{v.variation.variation_reference}</p>
                <p className="text-xs text-muted-foreground">
                  {v.variation.variation_type.replace(/_/g, ' ')} · requested {formatDateTime(v.variation.requested_at)}
                  {v.variation.decided_at ? ` · decided ${formatDateTime(v.variation.decided_at)}` : ''}
                  {v.variation.effective_date ? ` · effective ${formatDateOnly(v.variation.effective_date)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={STATUS_STYLES[v.variation.status]}>
                  {v.variation.status.replace(/_/g, ' ')}
                </Badge>
                {['requested', 'under_assessment'].includes(v.variation.status) && (
                  <GuardedButton module="license_management" action="approve" data-rbac="license_management.approve" size="sm" onClick={() => setDecide(v)}>Decide</GuardedButton>
                )}
              </div>
            </div>
            {v.variation.rationale && <p className="px-4 pt-3 text-sm">{v.variation.rationale}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Approved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.current_value || '—'}</TableCell>
                    <TableCell className="text-sm">{i.requested_value || '—'}</TableCell>
                    <TableCell className="text-sm">{i.approved_value || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>

      <Dialog open={openDialog} onOpenChange={(o) => !o && resetOpen()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Open variation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Variation type</Label>
              <Select value={variationType} onValueChange={setVariationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VARIATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="var-rationale">Rationale</Label>
              <Textarea id="var-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Requested changes</Label>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <Input placeholder="Field key" value={it.field_key}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, field_key: e.target.value } : x))} />
                  <Input placeholder="Label" value={it.label}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} />
                  <Input placeholder="Current value" value={it.current_value}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, current_value: e.target.value } : x))} />
                  <div className="flex gap-2">
                    <Input placeholder="Requested value" value={it.requested_value}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, requested_value: e.target.value } : x))} />
                    <Button variant="ghost" size="icon" aria-label="Remove change"
                      onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button data-rbac="license_management.create" variant="outline" size="sm"
                onClick={() => setItems([...items, { field_key: '', label: '', current_value: '', requested_value: '' }])}>
                <Plus className="mr-1 h-4 w-4" />Add change
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetOpen}>Cancel</Button>
            <Button onClick={submitOpen} disabled={op.isPending}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open variation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decide} onOpenChange={(o) => !o && setDecide(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decide variation {decide?.variation.variation_reference}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Decision</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="refused">Refuse</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="var-dec-rationale">Decision rationale</Label>
              <Textarea id="var-dec-rationale" rows={4} value={decisionRationale}
                onChange={(e) => setDecisionRationale(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="var-eff">Effective date</Label>
              <Input id="var-eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecide(null)}>Cancel</Button>
            <Button data-rbac="license_management.edit" onClick={submitDecision} disabled={op.isPending}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
