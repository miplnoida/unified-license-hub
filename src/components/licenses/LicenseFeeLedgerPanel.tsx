import { formatBaseMoney, formatRecordMoney } from '@/lib/money';
/**
 * P04 A.15–A.17 — licence lifecycle fee ledger.
 *
 * Amounts, blocking status and eligibility come from `license_fee_ledger()`;
 * every mutation goes through `license_fee_operation()` which enforces
 * permission, maker/checker on verification, and a written waiver rationale.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateOnly } from '@/lib/datetime';
import {
  LicenseFeeAssessment, LicenseFeeOperation, useLicenseFeeLedger, useLicenseFeeOperation,
} from '@/hooks/useLicenseP04Extensions';

const STATUS_STYLES: Record<string, string> = {
  due: 'bg-warning/10 text-warning border-warning/20',
  paid: 'bg-primary/10 text-primary border-primary/20',
  verified: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  waived: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground',
};

const OPERATION_TITLE: Record<LicenseFeeOperation, string> = {
  record_payment: 'Record payment',
  verify_payment: 'Verify payment',
  waive: 'Waive fee',
};

export default function LicenseFeeLedgerPanel({ licenseId }: { licenseId: string }) {
  const { data, isLoading } = useLicenseFeeLedger(licenseId);
  const op = useLicenseFeeOperation(licenseId);
  const [target, setTarget] = useState<{ row: LicenseFeeAssessment; operation: LicenseFeeOperation } | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');

  const close = () => { setTarget(null); setReference(''); setReason(''); };

  const submit = async () => {
    if (!target) return;
    const payload =
      target.operation === 'record_payment' ? { payment_reference: reference }
      : target.operation === 'waive' ? { reason }
      : {};
    try {
      await op.mutateAsync({ assessmentId: target.row.id, operation: target.operation, payload });
      toast.success(`${OPERATION_TITLE[target.operation]} recorded.`);
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The server refused this fee operation.');
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const rows = data?.assessments ?? [];
  const gates = data?.gates ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-primary" />Lifecycle fees
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {gates.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Fees and verification are blocking this licence</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 text-sm">{gates.map((g) => <li key={g.key + g.label}>{g.label}</li>)}</ul>
            </AlertDescription>
          </Alert>
        )}

        {data?.summary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Outstanding', String(data.summary.outstanding)],
              ['Outstanding value', formatBaseMoney(data.summary.outstanding_amount)],
              ['Verified', String(data.summary.verified)],
              ['Waived', String(data.summary.waived)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-mono text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No lifecycle fee has been assessed for this licence.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fee</TableHead>
                <TableHead>Matter</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Governed operations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.description ?? r.fee_type_code ?? 'Lifecycle fee'}</p>
                    {r.payment_reference && <p className="font-mono text-xs text-muted-foreground">{r.payment_reference}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.matter_kind ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{formatRecordMoney(r.amount, r.currency)}</TableCell>
                  <TableCell>{formatDateOnly(r.due_date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                    {r.blocking && r.status !== 'verified' && r.status !== 'waived' && (
                      <p className="mt-1 text-xs text-warning">blocking</p>
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {r.status === 'due' && (
                      <Button data-rbac="license_management.edit" size="sm" variant="outline" onClick={() => setTarget({ row: r, operation: 'record_payment' })}>
                        Record payment
                      </Button>
                    )}
                    {r.status === 'paid' && (
                      <Button data-rbac="license_management.edit" size="sm" onClick={() => setTarget({ row: r, operation: 'verify_payment' })}>Verify</Button>
                    )}
                    {['due', 'paid'].includes(r.status) && (
                      <GuardedButton module="license_management" action="edit" data-rbac="license_management.edit" size="sm" variant="ghost" onClick={() => setTarget({ row: r, operation: 'waive' })}>Waive</GuardedButton>
                    )}
                    {['verified', 'waived', 'void'].includes(r.status) && (
                      <span className="text-xs text-muted-foreground">Closed</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{target ? OPERATION_TITLE[target.operation] : ''}</DialogTitle></DialogHeader>
          {target?.operation === 'record_payment' && (
            <div className="space-y-2">
              <Label htmlFor="fee-ref">Payment reference</Label>
              <Input id="fee-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
          {target?.operation === 'waive' && (
            <div className="space-y-2">
              <Label htmlFor="fee-reason">Waiver rationale</Label>
              <Textarea id="fee-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </div>
          )}
          {target?.operation === 'verify_payment' && (
            <p className="text-sm text-muted-foreground">
              Verification is refused by the server if you are the officer who recorded this payment.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={op.isPending}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
