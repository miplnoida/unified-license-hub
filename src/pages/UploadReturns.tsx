import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Upload, FileUp, CheckCircle, AlertTriangle, FileText, X } from 'lucide-react';

const recentUploads = [
  { name: 'Insurance_Monthly_Jan2024.xlsx', size: '2.4 MB', status: 'success', date: '2024-01-15 14:30', records: 156 },
  { name: 'Banking_Q4_2023.csv', size: '1.8 MB', status: 'success', date: '2024-01-14 10:15', records: 89 },
  { name: 'Capital_Markets_Jan.xlsx', size: '3.1 MB', status: 'error', date: '2024-01-13 16:45', records: 0 },
  { name: 'Pension_Monthly_Dec.xlsx', size: '1.2 MB', status: 'success', date: '2024-01-10 09:20', records: 42 },
];

export default function UploadReturns() {
  const [dragActive, setDragActive] = useState(false);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Upload Returns" description="Bulk upload return data from spreadsheet files." backHref="/returns" backLabel="Returns" />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Upload Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Return Type</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Select return type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="insurance-monthly">Insurance Monthly Return</SelectItem>
                  <SelectItem value="banking-quarterly">Banking Quarterly Report</SelectItem>
                  <SelectItem value="capital-monthly">Capital Markets Monthly</SelectItem>
                  <SelectItem value="pension-quarterly">Pension Fund Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reporting Period</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Select period..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jan-2024">January 2024</SelectItem>
                  <SelectItem value="q4-2023">Q4 2023</SelectItem>
                  <SelectItem value="dec-2023">December 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Upload Zone */}
        <Card className="animate-slide-up delay-200">
          <CardContent className="pt-6">
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); }}
            >
              <FileUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Drop your file here</h3>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Supports .xlsx, .xls, and .csv files up to 10MB
              </p>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Uploads */}
        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentUploads.map((upload, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    upload.status === 'success' ? 'bg-success/10' : 'bg-destructive/10'
                  }`}>
                    {upload.status === 'success'
                      ? <CheckCircle className="h-5 w-5 text-success" />
                      : <AlertTriangle className="h-5 w-5 text-destructive" />
                    }
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{upload.name}</p>
                    <p className="text-sm text-muted-foreground">{upload.size} · {upload.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  {upload.status === 'success' ? (
                    <Badge variant="approved">{upload.records} records</Badge>
                  ) : (
                    <Badge variant="rejected">Failed</Badge>
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
