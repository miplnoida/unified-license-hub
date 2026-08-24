import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAccessStatus } from './accessStatus';

/**
 * Access clarity. A responsibility says WHERE work applies — it never grants a
 * permission, so the administrator is told plainly whether a separate access
 * review is needed. No role is ever changed from here.
 */
export function AccessStatusNote({ userId }: { userId: string | null | undefined }) {
  const access = useAccessStatus(userId);
  if (!userId) return null;

  return (
    <div className="rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase text-muted-foreground">Access</span>
        <Badge variant={access.ready ? 'default' : 'outline'}>{access.label}</Badge>
        {!access.ready && (
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link to="/admin/users">Review access</Link>
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{access.message}</p>
    </div>
  );
}
