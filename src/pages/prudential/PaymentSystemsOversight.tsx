import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Landmark } from 'lucide-react';
import { OperatorTable } from '@/components/prudential/payments/OperatorTable';
import { PfmiObservancePanel } from '@/components/prudential/payments/PfmiObservancePanel';
import { IncidentsPanel } from '@/components/prudential/payments/IncidentsPanel';
import { RetailPaymentsPanel } from '@/components/prudential/payments/RetailPaymentsPanel';
import { usePaymentIncidents, usePaymentOperators } from '@/hooks/usePaymentSystems';

export default function PaymentSystemsOversight() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') ?? 'register';
  const { data: operators = [] } = usePaymentOperators();
  const { data: incidents = [] } = usePaymentIncidents();

  const fmi = operators.filter(o => o.operator_type !== 'msb');
  const msb = operators.filter(o => o.operator_type === 'msb');
  const sifmi = operators.filter(o => o.systemically_important).length;
  const openIncidents = incidents.filter(i => i.resolution_status !== 'resolved').length;

  const openAssessment = (id: string) => navigate(`/prudential/pfmi-assessments/${id}`);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Payment Systems Oversight</h1>
            <p className="text-sm text-muted-foreground">
              Operator and FMI register, PFMI observance assessment, incident reporting and retail payments data.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: 'Payment systems & FMIs', value: fmi.length },
            { label: 'Money service businesses', value: msb.length },
            { label: 'Systemically important', value: sifmi },
            { label: 'Open incidents', value: openIncidents },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={v => setParams({ tab: v })}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="register">Operator register</TabsTrigger>
            <TabsTrigger value="msb">MSB register</TabsTrigger>
            <TabsTrigger value="pfmi">PFMI observance</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="retail">Retail payments data</TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="mt-4">
            <OperatorTable onOpenAssessment={openAssessment} />
          </TabsContent>
          <TabsContent value="msb" className="mt-4">
            <OperatorTable onlyType="msb" onOpenAssessment={openAssessment} />
          </TabsContent>
          <TabsContent value="pfmi" className="mt-4">
            <PfmiObservancePanel />
          </TabsContent>
          <TabsContent value="incidents" className="mt-4">
            <IncidentsPanel />
          </TabsContent>
          <TabsContent value="retail" className="mt-4">
            <RetailPaymentsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
