import { Bell, UserCircle, LogOut, Layers, Info, CheckCircle, AlertTriangle, XCircle, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/platform';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useActiveSector } from '@/contexts/ActiveSectorContext';
import { usePpoc } from '@/contexts/PpocContext';
import { getEffectiveUserRoleLabel } from '@/lib/effectiveRole';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { notificationLink } from '@/lib/notificationLinks';
import { GlobalNavSearch } from '@/components/layout/GlobalNavSearch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const notifTypeIcon: Record<string, JSX.Element> = {
  info: <Info className="h-4 w-4 text-info" />,
  success: <CheckCircle className="h-4 w-4 text-success" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
};

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, loading, counts, lastUrgentAt } =
    useNotifications();
  const recent = notifications.slice(0, 20);
  const hasUrgent = counts.unread_urgent > 0;
  const [pulse, setPulse] = useState(false);

  // Briefly pulse the bell when a critical/high notification arrives live.
  useEffect(() => {
    if (!lastUrgentAt) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 6000);
    return () => clearTimeout(t);
  }, [lastUrgentAt]);
  const { activeSectorName } = useActiveSector();
  const { isPpoc, actingAs, loading: ppocLoading, resolvedLicenseeId } = usePpoc();
  const portalContext = useEffectivePortalContext();
  const isLicensee = !!user && portalContext.isLicensee;
  const effectiveRoleLabel = user
    ? getEffectiveUserRoleLabel({
        baseRole: user.role,
        userType: user.userType,
        isPpoc,
        actingAs,
        resolvedLicenseeId,
        hasPrimaryUserAccess:
          !!user.licenseeId
          || String(user.userType || '').toLowerCase() === 'primary'
          || user.role === 'licensee_primary',
        ppocLoading,
      })
    : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 backdrop-blur-md px-3 sm:px-6">
      <div className="flex items-center gap-4 pl-10 md:pl-0">
        <GlobalNavSearch />
      </div>

      <div className="flex items-center gap-3">
        {isLicensee && (
          <button
            onClick={() => navigate('/change-sector')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            title="Change active sector"
          >
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] uppercase tracking-wide font-semibold text-primary">Sector</span>
            <span className="text-xs font-semibold text-foreground">
              {activeSectorName || 'Not set'}
            </span>
          </button>
        )}
        {user?.delegatedRole && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-300">
              Acting as
            </span>
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {ROLE_LABELS[user.delegatedRole]}
            </span>
          </div>
        )}
        <HoverCard openDelay={100} closeDelay={150}>
          <HoverCardTrigger asChild>
            <Button
              data-rbac="notification_management.view"
              variant="ghost"
              size="icon"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              className="relative h-9 w-9"
              onClick={() => navigate('/notifications')}
            >
              <Bell className={`h-4 w-4 ${hasUrgent ? 'text-destructive' : ''} ${pulse ? 'animate-pulse' : ''}`} />
              {unreadCount > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full text-[10px] font-bold ${
                    hasUrgent
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-primary text-primary-foreground'
                  } ${pulse ? 'animate-pulse' : ''}`}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          </HoverCardTrigger>
          <HoverCardContent align="end" className="w-96 p-0 z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant={hasUrgent ? 'destructive' : 'default'} className="text-[10px] px-1.5">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-8 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : recent.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  You have no notifications
                </div>
              ) : (
                recent.map((n) => {
                  const urgent = n.severity === 'critical' || n.severity === 'high';
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                        navigate(
                          n.source_route
                          || notificationLink(n.entity_type, n.entity_id, n.metadata)
                          || '/notifications',
                        );
                      }}
                      className={`w-full text-left flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {urgent
                          ? <AlertTriangle className="h-4 w-4 text-destructive" />
                          : notifTypeIcon[n.type] || notifTypeIcon.info}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs truncate ${!n.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{n.preview || n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          {n.source_reference ? ` · ${n.source_reference}` : ''}
                        </p>
                      </div>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t px-3 py-2">
              <button
                onClick={() => navigate('/notifications')}
                className="w-full text-center text-xs font-medium text-primary hover:underline"
              >
                View all notifications
              </button>
            </div>
          </HoverCardContent>

        </HoverCard>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-3 border-l cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors outline-none">
                <Avatar className="h-8 w-8">
                  {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {user.fullName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium leading-none">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.delegatedRole
                      ? `${ROLE_LABELS[user.delegatedRole]} (delegated)`
                      : isPpoc
                        ? effectiveRoleLabel
                        : (user.dynamicRoleName || effectiveRoleLabel)}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                <UserCircle className="mr-2 h-4 w-4" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
