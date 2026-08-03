import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationPreferenceMatrix } from '@/components/notifications/NotificationPreferenceMatrix';

export default function NotificationSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <PageHeader
          title="Notification Settings"
          description="Choose how you are notified for each notification type. Mandatory and urgent notifications are always delivered."
          actions={
            <Button variant="outline" onClick={() => navigate('/settings')}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
          }
        />
        <NotificationPreferenceMatrix />
      </div>
    </DashboardLayout>
  );
}
