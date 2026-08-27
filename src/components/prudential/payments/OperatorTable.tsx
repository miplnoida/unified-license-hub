import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, ShieldAlert } from 'lucide-react';
import {
  LICENSE_STATUSES,
  OBSERVANCE_LEVELS,
  OPERATOR_TYPES,
  OperatorRow,
  labelOf,
  observanceTone,
  usePaymentOperators,
  useStartPfmiAssessment,
} from '@/hooks/usePaymentSystems';
import { OperatorDialog } from './OperatorDialog';

interface Props {
  /** restrict the register to a single operator type (used by the MSB tab) */
  onlyType?: string;
  onOpenAssessment: (assessmentId: string) => void;
}

export function OperatorTable({ onlyType, onOpenAssessment }: Props) {
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OperatorRow | null>(null);

  const { data: rows = [], isLoading } = usePaymentOperators({
    operator_type: onlyType ?? (type === 'all' ? undefined : type),
    license_status: status === 'all' ? undefined : status,
  });
  const start = useStartPfmiAssessment();

  const filtered = rows.filter(r =>
    !search ||
    r.operator_name.toLowerCase().includes(search.toLowerCase()) ||
    r.reference.toLowerCase().includes(search.toLowerCase()),
  );

  const startAssessment = async (operatorId: string) => {
    const res = await start.mutateAsync({ operator_id: operatorId });
    if (res?.assessment_id) onOpenAssessment(res.assessment_id);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="max-w-xs" placeholder="Search operator or reference"
          value={search} onChange={e => setSearch(e.target.value)} />
        {!onlyType && (
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All operator types</SelectItem>
              {OPERATOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All licence statuses</SelectItem>
            {LICENSE_STATUSES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" data-rbac="prudential_supervision.create"
            onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add operator
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Licence status</TableHead>
                <TableHead>Last PFMI assessment</TableHead>
                <TableHead>PFMI observance</TableHead>
                <TableHead className="text-right">Open incidents</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              )}
              {!isLoading && !filtered.length && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No operators on the register yet.
                </TableCell></TableRow>
              )}
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link to={`/prudential/payment-systems/${r.id}`} className="font-medium hover:underline">
                      {r.operator_name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">{r.reference}</div>
                    {r.systemically_important && (
                      <Badge variant="outline" className="mt-1 bg-warning/10 text-warning border-warning/20">
                        <ShieldAlert className="h-3 w-3 mr-1" />Systemically important
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{labelOf(OPERATOR_TYPES, r.operator_type)}</TableCell>
                  <TableCell><Badge variant="outline">{labelOf(LICENSE_STATUSES, r.license_status)}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.last_pfmi_assessment_date
                      ? new Date(r.last_pfmi_assessment_date).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={observanceTone(r.pfmi_compliance_level)}>
                      {r.pfmi_compliance_level ? labelOf(OBSERVANCE_LEVELS, r.pfmi_compliance_level) : 'Not assessed'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.open_incidents ?? 0}</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                      onClick={() => { setEditing(r); setDialogOpen(true); }}>Edit</Button>
                    <Button size="sm" data-rbac="prudential_supervision.create"
                      disabled={start.isPending} onClick={() => startAssessment(r.id)}>
                      Start PFMI assessment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OperatorDialog open={dialogOpen} onOpenChange={setDialogOpen}
        operator={editing} defaultType={onlyType} />
    </div>
  );
}
