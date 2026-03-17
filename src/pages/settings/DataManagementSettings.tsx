import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DataManagementSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Data Management"
          description="Configure backup schedules, data retention, and export settings."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Backup Configuration</CardTitle>
            <CardDescription>Automatic backup schedule and storage settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Backup Frequency</Label>
                <Select defaultValue="daily">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retention Period (days)</Label>
                <Input type="number" defaultValue="30" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium text-foreground">Auto Backup</p>
                <p className="text-sm text-muted-foreground">Automatically back up database on schedule.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex gap-2">
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export Database</Button>
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export Audit Logs</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Data Retention</CardTitle>
            <CardDescription>Configure how long different data types are retained.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Audit Logs', period: '365 days' },
              { label: 'Completed Applications', period: '5 years' },
              { label: 'Expired Licenses', period: '7 years' },
              { label: 'Session Logs', period: '90 days' },
              { label: 'Notification History', period: '180 days' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="font-medium text-foreground">{item.label}</span>
                <Badge variant="outline">{item.period}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/20">
              <div>
                <p className="font-medium text-foreground">Purge Old Data</p>
                <p className="text-sm text-muted-foreground">Remove data older than the configured retention period.</p>
              </div>
              <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Purge</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
