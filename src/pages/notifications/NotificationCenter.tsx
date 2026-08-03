/**
 * NOT-CEN-001 — Notification Centre (canonical notification page for /notifications).
 *
 * All filtering, searching and paging happens server-side through the
 * `notification_feed` RPC. There is no hardcoded notification data here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  useNotificationsContext,
  type AppNotification,
} from '@/contexts/NotificationsContext';
import { resolveNotificationStatus, type NotificationSeverity } from '@/types/notifications';
import { notificationLink } from '@/lib/notificationLinks';
import {
  useNotificationFeed, NOTIFICATION_PAGE_SIZE, type NotificationTab,
} from '@/hooks/useNotificationFeed';
import { NotificationDetailDrawer } from '@/components/notifications/NotificationDetailDrawer';
import { ForwardNotificationDialog } from '@/components/notifications/ForwardNotificationDialog';
import {
  SEVERITY_META, NOTIFICATION_MODULES,
} from '@/components/notifications/notificationMeta';
import {
  Bell, CheckCheck, Loader2, Search, Archive, Download, ExternalLink,
  RotateCcw, AlertCircle, Forward,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const TABS: Array<{ value: NotificationTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'action_required', label: 'Action required' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'system', label: 'System' },
  { value: 'archived', label: 'Archived' },
];

const STATUSES = ['unread', 'read', 'actioned', 'dismissed', 'archived'];

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { counts, markManyRead, markAllRead, dismiss, archive, markActioned, refresh } =
    useNotificationsContext();

  const [tab, setTab] = useState<NotificationTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [forwarding, setForwarding] = useState<AppNotification | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(() => ({
    tab,
    module: moduleFilter === 'all' ? null : moduleFilter,
    severity: severity === 'all' ? null : severity,
    status: statusFilter === 'all' ? null : statusFilter,
    from: from ? new Date(from).toISOString() : null,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    search: debouncedSearch,
  }), [tab, moduleFilter, severity, statusFilter, from, to, debouncedSearch]);

  const feed = useNotificationFeed(filters);

  useEffect(() => { setSelected([]); }, [filters]);

  const rows = feed.rows;
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? [] : rows.map(r => r.id));
  const toggleOne = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const searchTooShort = search.trim().length > 0 && search.trim().length < 3;

  const openDetail = async (n: AppNotification) => {
    setDetail(n);
    if (resolveNotificationStatus(n) === 'unread') {
      await markManyRead([n.id]);
      feed.patchRow(n.id, { read: true, status: 'read' });
    }
  };

  const runBulk = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    const ids = selected.length ? selected : rows.map(r => r.id);
    if (ids.length === 0) { toast.error('There is nothing to export'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('notification_export' as never, { _ids: ids } as never);
    setBusy(false);
    if (error) { toast.error(error.message || 'Export was not permitted'); return; }
    const list = (data || []) as Array<Record<string, string | null>>;
    if (list.length === 0) { toast.error('There is nothing to export'); return; }
    const header = ['Date', 'Severity', 'Category', 'Module', 'Type', 'Title', 'Message', 'Reference', 'Status'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...list.map(r => [
        r.created_at, r.severity, r.category, r.module, r.type,
        r.title, r.message, r.source_reference, r.status,
      ].map(esc).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${list.length} notification${list.length === 1 ? '' : 's'}`);
  };

  const summary = [
    { label: 'Unread', value: counts.unread },
    { label: 'Urgent (critical/high)', value: counts.unread_urgent },
    { label: 'Action required', value: counts.action_required },
    { label: 'Alerts', value: counts.alerts },
  ];

  const resetFilters = () => {
    setSearch(''); setSeverity('all'); setModuleFilter('all');
    setStatusFilter('all'); setFrom(''); setTo('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notification Centre"
          description="Every alert, task and system message addressed to you"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy}>
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => { refresh(); feed.reload(); }}>
                <RotateCcw className="h-4 w-4 mr-2" />Refresh
              </Button>
              {counts.unread > 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => runBulk('All notifications marked as read', async () => {
                    await markAllRead();
                    await feed.reload();
                  })}
                >
                  <CheckCheck className="h-4 w-4 mr-2" />Mark all read
                </Button>
              )}
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.map(s => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold font-mono">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as NotificationTab)}>
          <TabsList className="flex-wrap h-auto">
            {TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === 'unread' && counts.unread > 0 && (
                  <Badge variant="default" className="ml-2 text-[10px] px-1.5">{counts.unread}</Badge>
                )}
                {t.value === 'action_required' && counts.action_required > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">{counts.action_required}</Badge>
                )}
                {t.value === 'alerts' && counts.alerts > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">{counts.alerts}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, message or reference…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notifications"
            />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger aria-label="Severity"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {(Object.keys(SEVERITY_META) as NotificationSeverity[]).map(s => (
                <SelectItem key={s} value={s}>{SEVERITY_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger aria-label="Module"><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {NOTIFICATION_MODULES.map(m => (
                <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        </div>

        {searchTooShort && (
          <p className="text-xs text-muted-foreground">Type at least 3 characters to search.</p>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="text-xs text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : 'Select all loaded'}
            </span>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  size="sm" variant="outline" disabled={busy}
                  onClick={() => runBulk('Marked as read', async () => {
                    await markManyRead(selected);
                    selected.forEach(id => feed.patchRow(id, { read: true, status: 'read' }));
                  })}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" />Mark read
                </Button>
                {tab !== 'archived' && (
                  <>
                    <Button
                      size="sm" variant="outline" disabled={busy}
                      onClick={() => runBulk('Dismissed', async () => {
                        await dismiss(selected);
                        feed.removeRows(selected);
                      })}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm" variant="outline" disabled={busy}
                      onClick={() => runBulk('Moved to archive', async () => {
                        await archive(selected);
                        feed.removeRows(selected);
                      })}
                    >
                      <Archive className="h-3.5 w-3.5 mr-1.5" />Archive
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={busy}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />Export selected
                </Button>
              </div>
            )}
          </div>
        )}

        {feed.loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : feed.error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-10 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">
                We could not load your notifications. {feed.error}
              </p>
              <Button size="sm" variant="outline" onClick={feed.reload}>
                <RotateCcw className="h-4 w-4 mr-2" />Try again
              </Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">
                {tab === 'unread'
                  ? 'You are all caught up.'
                  : 'No notifications match these filters.'}
              </p>
              <Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map(n => {
              const sev = SEVERITY_META[n.severity] ?? SEVERITY_META.medium;
              const status = resolveNotificationStatus(n);
              const link = n.source_route || notificationLink(n.entity_type, n.entity_id, n.metadata);
              return (
                <Card key={n.id} className={status === 'unread' ? 'border-primary/30 bg-primary/5' : ''}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(n.id)}
                      onCheckedChange={() => toggleOne(n.id)}
                      aria-label={`Select ${n.title}`}
                    />
                    <div className={`shrink-0 mt-0.5 rounded-md border p-1.5 ${sev.className}`}>{sev.icon}</div>
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => openDetail(n)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm ${status === 'unread' ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                          {n.title}
                        </p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${sev.className}`}>{sev.label}</Badge>
                        {n.category === 'action_required' && (
                          <Badge variant="default" className="text-[10px] px-1.5">Action required</Badge>
                        )}
                        {n.module && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 capitalize">
                            {n.module.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {n.source_reference && (
                          <span className="text-[11px] font-mono text-muted-foreground">{n.source_reference}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {n.preview || n.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span
                          className="text-xs text-muted-foreground"
                          title={format(new Date(n.created_at), 'd MMM yyyy, h:mm:ss a')}
                        >
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                        {link && (
                          <span className="text-xs text-primary inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />Open record
                          </span>
                        )}
                        {(status === 'archived' || status === 'dismissed') && (
                          <span className="text-xs text-muted-foreground capitalize">{status}</span>
                        )}
                      </div>
                    </button>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon" variant="ghost" title="Forward to a colleague"
                        onClick={() => setForwarding(n)}
                      >
                        <Forward className="h-4 w-4" />
                      </Button>
                      {status !== 'archived' && status !== 'dismissed' && !n.system_required && (
                        <Button
                          size="icon" variant="ghost" title="Archive"
                          onClick={async () => {
                            await archive([n.id]);
                            feed.removeRows([n.id]);
                          }}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {feed.hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={feed.loadMore} disabled={feed.loadingMore}>
              {feed.loadingMore
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : null}
              Load {NOTIFICATION_PAGE_SIZE} more
            </Button>
          </div>
        )}

        <NotificationDetailDrawer
          notification={detail}
          open={!!detail}
          onOpenChange={(v) => { if (!v) setDetail(null); }}
          onMarkRead={async (id) => {
            await markManyRead([id]);
            feed.patchRow(id, { read: true, status: 'read' });
          }}
          onMarkActioned={async (id, target) => {
            await markActioned(id, target);
            feed.patchRow(id, { status: 'actioned', read: true });
          }}
          onArchive={async (id) => {
            await archive([id]);
            feed.removeRows([id]);
          }}
          onForward={(n) => { setDetail(null); setForwarding(n); }}
        />

        <ForwardNotificationDialog
          notification={forwarding}
          open={!!forwarding}
          onOpenChange={(v) => { if (!v) setForwarding(null); }}
        />
      </div>
    </DashboardLayout>
  );
}
