import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell, CheckCheck, Loader2, Info, AlertTriangle, CheckCircle, XCircle, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const typeIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-info" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  success: <CheckCircle className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-destructive" />,
};

export default function NotificationCenter() {
  const { notifications, loading, unreadCount, markRead, markAllRead } = useNotifications();

  const handleMarkAllRead = async () => {
    await markAllRead();
    toast.success('All notifications marked as read');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notifications"
          description={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          actions={
            unreadCount > 0 ? (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="h-4 w-4 mr-2" />Mark All Read
              </Button>
            ) : undefined
          }
        />

        {/* Channel summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'In-App', icon: <Bell className="h-5 w-5" />, count: notifications.length },
            { label: 'Email', icon: <Mail className="h-5 w-5" />, count: 0, desc: 'Configured via templates' },
            { label: 'SMS', icon: <Smartphone className="h-5 w-5" />, count: 0, desc: 'Configured via templates' },
          ].map(ch => (
            <Card key={ch.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">{ch.icon}</div>
                  <div>
                    <p className="text-lg font-bold">{ch.count}</p>
                    <p className="text-sm text-muted-foreground">{ch.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{notifications.length}</Badge></TabsTrigger>
            <TabsTrigger value="unread">Unread <Badge variant="default" className="ml-2">{unreadCount}</Badge></TabsTrigger>
          </TabsList>

          {['all', 'unread'].map(tab => (
            <TabsContent key={tab} value={tab}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.filter(n => tab === 'all' || !n.read).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {tab === 'unread' ? 'All caught up!' : 'No notifications yet'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {notifications
                    .filter(n => tab === 'all' || !n.read)
                    .map(n => (
                      <Card
                        key={n.id}
                        className={`cursor-pointer transition-colors ${!n.read ? 'border-primary/30 bg-primary/5' : ''}`}
                        onClick={() => !n.read && markRead(n.id)}
                      >
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="shrink-0 mt-0.5">
                            {typeIcons[n.type] || typeIcons.info}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                              {!n.read && <Badge variant="default" className="text-[10px] px-1.5">New</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
