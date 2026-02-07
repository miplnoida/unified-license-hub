import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, Filter, FileBarChart } from 'lucide-react';

const recentStatements = [
  { name: 'Annual Financial Statement 2023', type: 'Financial', generatedDate: '2024-01-20', status: 'ready' },
  { name: 'Compliance Statement Q4 2023', type: 'Compliance', generatedDate: '2024-01-15', status: 'ready' },
  { name: 'Revenue Collection Report', type: 'Revenue', generatedDate: '2024-01-10', status: 'ready' },
  { name: 'License Activity Summary', type: 'Activity', generatedDate: '2024-01-05', status: 'generating' },
];

export default function StatementReports() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Statement Reports"
          description="Generate and download official regulatory statements."
          actions={<Button><Download className="h-4 w-4 mr-2" />Generate Statement</Button>}
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader><CardTitle className="text-lg">Generate New Statement</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Statement Type</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">Financial Statement</SelectItem>
                  <SelectItem value="compliance">Compliance Statement</SelectItem>
                  <SelectItem value="revenue">Revenue Report</SelectItem>
                  <SelectItem value="activity">Activity Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input type="date" defaultValue="2024-01-01" />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input type="date" defaultValue="2024-01-31" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader><CardTitle className="text-lg">Recent Statements</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentStatements.map((stmt, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileBarChart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{stmt.name}</p>
                    <p className="text-sm text-muted-foreground">{stmt.type} · {stmt.generatedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={stmt.status === 'ready' ? 'approved' : 'pending' as any} className="capitalize">{stmt.status}</Badge>
                  {stmt.status === 'ready' && (
                    <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />PDF</Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
