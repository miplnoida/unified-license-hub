import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, Pencil, ShieldAlert } from 'lucide-react';
import { OperatorDialog } from '@/components/prudential/payments/OperatorDialog';
import { IncidentsPanel } from '@/components/prudential/payments/IncidentsPanel';
import { RetailPaymentsPanel } from '@/components/prudential/payments/RetailPaymentsPanel';
import {
  AML_STATUSES,
  LICENSE_STATUSES,
  OBSERVANCE_LEVELS,
  OPERATOR_TYPES,
  labelOf,
  observanceTone,
  usePaymentOperator,
  usePaymentOversightEvents,
  usePfmiAssessments,
  useStartPfmiAssessment,
} from '@/hooks/usePaymentSystems';

export default function PaymentOperatorProfile() {
  const { operatorId } = useParams<{ operatorId: string }>();
  const navigate = useNavigate();
  const { data: operator, isLoading } = usePaymentOperator(operatorId);
  const { data: assessments = [] } = usePfmiAssessments({ operator_id: operatorId });
  const { data: events = [] } = usePaymentOversightEvents({ operator_id: operatorId });
  const start = useStartPfmiAssessment();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return <DashboardLayout><div className="py-20 text-center">
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
    </div></DashboardLayout>;
  }
  if (!operator) {
    return <DashboardLayout><Card><CardContent className="py-16 text-center text-muted-foreground">
      Operator not found or you do not have access.
    </CardContent></Card></DashboardLayout>;
  }

  const facts: [string, string][] = [
    ['Operator type', labelOf(OPERATOR_TYPES, operator.operator_type)],
    ['Licence number', operator.licence_number ?? '—'],
    ['Licence status', labelOf(LICENSE_STATUSES, operator.license_status)],
    ['Designation date', operator.designation_date ? new Date(operator.designation_date).toLocaleDateString() : '—'],
    ['Active agents', operator.active_agents_count != null ? String(operator.active_agents_count) : '—'],
    ['AML compliance', labelOf(AML_STATUSES, operator.aml_compliance_status) || '—'],
    ['Contact', operator.contact_name ?? '—'],
    ['Contact email', operator.contact_email ?? '—'],
    ['Contact phone', operator.contact_phone ?? '—'],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/prudential/payment-systems')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Oversight
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{operator.operator_name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{operator.reference}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {operator.systemically_important && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                <ShieldAlert className="h-3 w-3 mr-1" />Systemically important
              </Badge>
            )}
            <Badge variant="outline" className={observanceTone(operator.pfmi_compliance_level)}>
              {operator.pfmi_compliance_level
                ? labelOf(OBSERVANCE_LEVELS, operator.pfmi_compliance_level)
                : 'PFMI not assessed'}
            </Badge>
            <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </Button>
            <Button size="sm" data-rbac="prudential_supervision.create" disabled={start.isPending}
              onClick={async () => {
                const res = await start.mutateAsync({ operator_id: operator.id });
                if (res?.assessment_id) navigate(`/prudential/pfmi-assessments/${res.assessment_id}`);
              }}>
              Start PFMI assessment
            </Button>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="pfmi">PFMI assessments</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="retail">Retail payments</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Register details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="text-sm font-medium">{v}</p>
                  </div>
                ))}
                {operator.notes && (
                  <div className="md:col-span-3">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{operator.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pfmi" className="mt-4">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Overall rating</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!assessments.length && (
                      <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No PFMI assessments yet.
                      </TableCell></TableRow>
                    )}
                    {assessments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.reference}</TableCell>
                        <TableCell>{a.assessment_year}</TableCell>
                        <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                        <TableCell>
                          {a.overall_rating
                            ? <Badge variant="outline" className={observanceTone(a.overall_rating)}>
                                {labelOf(OBSERVANCE_LEVELS, a.overall_rating)}
                              </Badge>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/prudential/pfmi-assessments/${a.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incidents" className="mt-4">
            <IncidentsPanel operatorId={operator.id} />
          </TabsContent>
          <TabsContent value="retail" className="mt-4">
            <RetailPaymentsPanel operatorId={operator.id} />
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Oversight audit trail</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!events.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No recorded events.</p>
                )}
                {events.map(e => (
                  <div key={e.id} className="flex gap-3 border-b pb-2 last:border-0">
                    <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{e.event_type.replace(/_/g, ' ')}</p>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <OperatorDialog open={editOpen} onOpenChange={setEditOpen} operator={operator} />
      </div>
    </DashboardLayout>
  );
}
