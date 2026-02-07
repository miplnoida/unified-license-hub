import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell, CheckCircle, AlertTriangle, Info, FileText, ClipboardList, Check, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  date: string;
  category: string;
}

const notifications: Notification[] = [
  { id: '1', title: 'Application Approved', message: 'Your pre-license application APP-2024-0156 has been approved.', type: 'success', read: false, date: '2024-01-15T10:30:00Z', category: 'application' },
  { id: '2', title: 'Return Due Soon', message: 'Monthly return RET-2024-M01 is due in 5 days.', type: 'warning', read: false, date: '2024-01-15T09:00:00Z', category: 'return' },
  { id: '3', title: 'Query Raised', message: 'Additional documents required for APP-2024-0155.', type: 'info', read: false, date: '2024-01-14T15:45:00Z', category: 'application' },
  { id: '4', title: 'Return Overdue', message: 'Quarterly return RET-2023-Q4 is overdue by 3 days.', type: 'error', read: true, date: '2024-01-13T09:00:00Z', category: 'return' },
  { id: '5', title: 'Payment Received', message: 'Payment of $500.00 confirmed for APP-2024-0156.', type: 'success', read: true, date: '2024-01-12T14:20:00Z', category: 'payment' },
  { id: '6', title: 'System Maintenance', message: 'Scheduled maintenance on Jan 20, 2024 from 2:00-4:00 AM.', type: 'info', read: true, date: '2024-01-10T08:00:00Z', category: 'system' },
  { id: '7', title: 'New Form Available', message: 'Updated Life Insurance application form (v3) is now active.', type: 'info', read: true, date: '2024-01-08T11:00:00Z', category: 'system' },
];

const iconMap = {
  info: <Info className="h-5 w-5 text-info" />,
  success: <CheckCircle className="h-5 w-5 text-success" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  error: <AlertTriangle className="h-5 w-5 text-destructive" />,
};

const bgMap = {
  info: 'bg-info/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  error: 'bg-destructive/10',
};

export default function Notifications() {
  const [items, setItems] = useState(notifications);

  const markAllRead = () => setItems(prev => prev.map(n => ({ ...n, read: true })));
  const unreadCount = items.filter(n => !n.read).length;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Notifications"
          description={`You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}.`}
          actions={
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check className="h-4 w-4 mr-2" />Mark All Read
            </Button>
          }
        />

        <Tabs defaultValue="all" className="animate-slide-up delay-100">
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{items.length}</Badge></TabsTrigger>
            <TabsTrigger value="unread">Unread <Badge variant="default" className="ml-2">{unreadCount}</Badge></TabsTrigger>
          </TabsList>

          {['all', 'unread'].map(tab => (
            <TabsContent key={tab} value={tab}>
              <div className="space-y-2">
                {items
                  .filter(n => tab === 'all' || !n.read)
                  .map(n => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                        !n.read ? 'bg-card border-primary/20' : 'bg-muted/30'
                      }`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${bgMap[n.type]}`}>
                        {iconMap[n.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`font-medium ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                          </div>
                          {!n.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(n.date), 'MMM d, yyyy · h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
