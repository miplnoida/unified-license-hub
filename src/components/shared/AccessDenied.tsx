import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { logSecurityEvent, logComplianceAudit } from '@/lib/complianceAudit';

export function AccessDenied({ message }: { message?: string }) {
  const location = useLocation();
  useEffect(() => {
    // Fire-and-forget: log access denial both as a security event and in the compliance audit log.
    logSecurityEvent('ACCESS_DENIED', { target_resource: location.pathname, detail: { message } });
    logComplianceAudit({
      action_type: 'ACCESS_DENIED',
      object_type: 'route',
      object_id: location.pathname,
      after_value: { message: message ?? null },
    });
  }, [location.pathname, message]);
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6" data-route-state="denied">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          {message ||
            "You don't have permission to access this page. Please contact your administrator if you believe this is an error."}
        </p>
        <Button asChild>
          <Link to="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </DashboardLayout>
  );
}

export default AccessDenied;
