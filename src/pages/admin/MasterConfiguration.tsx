import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface MasterRecord {
  id: string;
  name: string;
  description: string;
  code: string;
  status: string;
  itemCount?: number;
}

const sectors: MasterRecord[] = [
  { id: '1', name: 'Insurance', description: 'Life, General, and Health Insurance', code: 'INS', status: 'active', itemCount: 3 },
  { id: '2', name: 'Banking', description: 'Commercial and Development Banking', code: 'BNK', status: 'active', itemCount: 2 },
  { id: '3', name: 'Capital Markets', description: 'Securities and Investment Services', code: 'CAP', status: 'active', itemCount: 2 },
  { id: '4', name: 'Pension & Retirement', description: 'Pension Funds and Retirement', code: 'PEN', status: 'active', itemCount: 2 },
  { id: '5', name: 'Cooperatives', description: 'Cooperative Financial Institutions', code: 'COP', status: 'draft', itemCount: 0 },
];

const categories: MasterRecord[] = [
  { id: '1', name: 'Life Insurer License', description: 'Full life insurance operations', code: 'INS-LIF', status: 'active' },
  { id: '2', name: 'General Insurer License', description: 'General insurance operations', code: 'INS-GEN', status: 'active' },
  { id: '3', name: 'Insurance Broker', description: 'Insurance brokerage license', code: 'INS-BRK', status: 'active' },
  { id: '4', name: 'Commercial Bank', description: 'Full commercial banking', code: 'BNK-COM', status: 'active' },
  { id: '5', name: 'Broker-Dealer', description: 'Securities broker-dealer', code: 'CAP-BRD', status: 'active' },
  { id: '6', name: 'Microfinance', description: 'Microfinance institution', code: 'BNK-MFI', status: 'draft' },
];

const services: MasterRecord[] = [
  { id: '1', name: 'License Amendment', description: 'Modify existing license terms', code: 'SVC-AMD', status: 'active' },
  { id: '2', name: 'License Renewal', description: 'Annual license renewal', code: 'SVC-RNW', status: 'active' },
  { id: '3', name: 'Branch Addition', description: 'Add new branch location', code: 'SVC-BRA', status: 'active' },
  { id: '4', name: 'Name Change', description: 'Change registered entity name', code: 'SVC-NAM', status: 'active' },
  { id: '5', name: 'Certificate Reissue', description: 'Reissue of license certificate', code: 'SVC-CRT', status: 'active' },
];

const masterColumns: Column<MasterRecord>[] = [
  { key: 'code', label: 'Code', render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge> },
  { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : 'draft' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: () => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
  )},
];

const sectorColumns: Column<MasterRecord>[] = [
  ...masterColumns.slice(0, 3),
  { key: 'itemCount', label: 'Sub-Sectors', render: (r) => <Badge variant="secondary">{r.itemCount}</Badge> },
  ...masterColumns.slice(3),
];

export default function MasterConfiguration() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Master Configuration" description="Manage sectors, categories, and services metadata." backHref="/dashboard" backLabel="Dashboard" />

        <Tabs defaultValue="sectors" className="animate-slide-up delay-100">
          <TabsList>
            <TabsTrigger value="sectors">Sectors</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          <TabsContent value="sectors">
            <DataTableShell
              columns={sectorColumns}
              data={sectors}
              searchPlaceholder="Search sectors..."
              actions={<Button><Plus className="h-4 w-4 mr-2" />Add Sector</Button>}
            />
          </TabsContent>
          <TabsContent value="categories">
            <DataTableShell
              columns={masterColumns}
              data={categories}
              searchPlaceholder="Search categories..."
              actions={<Button><Plus className="h-4 w-4 mr-2" />Add Category</Button>}
            />
          </TabsContent>
          <TabsContent value="services">
            <DataTableShell
              columns={masterColumns}
              data={services}
              searchPlaceholder="Search services..."
              actions={<Button><Plus className="h-4 w-4 mr-2" />Add Service</Button>}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
