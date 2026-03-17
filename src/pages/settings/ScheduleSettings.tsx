import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const holidays = [
  { date: '2024-01-01', name: "New Year's Day" },
  { date: '2024-01-15', name: 'Martin Luther King Jr. Day' },
  { date: '2024-02-19', name: "Presidents' Day" },
  { date: '2024-05-27', name: 'Memorial Day' },
  { date: '2024-07-04', name: 'Independence Day' },
  { date: '2024-09-02', name: 'Labor Day' },
  { date: '2024-12-25', name: 'Christmas Day' },
];

export default function ScheduleSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Schedule Settings"
          description="Configure business hours, working days, and holiday calendar."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Working Days</CardTitle>
            <CardDescription>Select the days your organization operates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {days.map((day, idx) => (
                <div key={day} className="flex items-center gap-2">
                  <Checkbox id={day} defaultChecked={idx < 5} />
                  <label htmlFor={day} className="text-sm font-medium">{day}</label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Business Hours</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Opening Time</Label>
              <Input type="time" defaultValue="08:00" />
            </div>
            <div className="space-y-2">
              <Label>Closing Time</Label>
              <Input type="time" defaultValue="17:00" />
            </div>
            <div className="space-y-2">
              <Label>SLA Response Time (hours)</Label>
              <Input type="number" defaultValue="48" />
            </div>
            <div className="space-y-2">
              <Label>Escalation Timeout (hours)</Label>
              <Input type="number" defaultValue="72" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Holiday Calendar</CardTitle>
                <CardDescription>Public holidays when the system pauses SLA calculations.</CardDescription>
              </div>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />Add Holiday</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {holidays.map(h => (
                <div key={h.date} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{h.date}</Badge>
                    <span className="font-medium text-foreground">{h.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
