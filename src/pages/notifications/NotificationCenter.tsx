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
  type NotificationCategory,
  type NotificationSeverity,
} from '@/contexts/NotificationsContext';
import { notificationLink } from '@/lib/notificationLinks';
import {
  Bell, CheckCheck, Loader2, Search, Archive, Download, ExternalLink,
  AlertOctagon, AlertTriangle, Info, Circle, RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const SEVERITY_META: Record<NotificationSeverity, { label: string; icon: JSX.Element; className: string }> = {
  critical: { label: 'Critical', icon: <AlertOctagon className="h-4 w-4" />, className: 'bg-destructive/10 text-destructive border-destructive/30' },
  high: { label: 'High', icon: <AlertTriangle className="h-4 w-4" />, className: 'bg-warning/10 text-warning border-warning/30' },
  medium: { label: 'Medium', icon: <Info className="h-4 w-4" />, className: 'bg-primary/10 text-primary border-primary/30' },
  low: { label: 'Low', icon: <Circle className="h-3.5 w-3.5" />, className: 'bg-muted text-muted-foreground border-border' },
};

const TABS: Array<{ value: string; label: string; category?: NotificationCategory; unreadOnly?: boolean; archived?: boolean }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread', unreadOnly: true },
  { value: 'action_required', label: 'Action required', category: 'action_required' },
  { value: 'alert', label: 'Alerts', category: 'alert' },
  { value: 'system', label: 'System', category: 'system' },
  { value: 'archived', label: 'Archived', archived: true },
];

const MODULES = [
  'licensing', 'applications', 'fit_and_proper', 'prudential',
  'conduct', 'enforcement', 'reporting', 'communications', 'system',
];

const PAGE_SIZE = 25;

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { counts, markManyRead, markAllRead, dismiss, markActioned, refresh } = useNotificationsContext();

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severity, setSeverity] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const activeTab = TABS.find(t => t.value === tab)!;

  useEffect(() => { setPage(0); setSelected([]); }, [tab, debouncedSearch, severity, moduleFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('search_notifications' as never, {
        _search: debouncedSearch || null,
        _category: activeTab.category ?? null,
        _severity: severity === 'all' ? null : severity,
        _module: moduleFilter === 'all' ? null : moduleFilter,
        _unread_only: !!activeTab.unreadOnly,
        _include_dismissed: !!activeTab.archived,
        _from: null,
        _to: null,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      } as never);
      if (cancelled) return;
      if (error) {
        toast.error('Could not load notifications');
        setRows([]);
      } else {
        const list = (data || []) as unknown as AppNotification[];
        setRows(activeTab.archived ? list.filter(n => n.dismissed_at) : list);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, debouncedSearch, severity, moduleFilter, page, activeTab, counts.unread]);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const toggleAll = () => setSelected(allSelected ? [] : rows.map(r => r.id));
  const toggleOne = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const open = async (n: AppNotification) => {
    const link = notificationLink(n.entity_type, n.entity_id, n.metadata);
    if (!n.read) await markManyRead([n.id]);
    if (link) {
      await markActioned(n.id, link);
      navigate(link);
    }
  };

  const bulkRead = async () => {
    await markManyRead(selected);
    setSelected([]);
    toast.success('Marked as read');
  };

  const bulkDismiss = async () => {
    await dismiss(selected);
    setRows(prev => prev.filter(r => !selected.includes(r.id)));
    setSelected([]);
    toast.success('Moved to archive');
  };

  const exportCsv = () => {
    const target = selected.length ? rows.filter(r => selected.includes(r.id)) : rows;
    if (target.length === 0) { toast.error('Nothing to export'); return; }
    const header = ['Date', 'Severity', 'Category', 'Module', 'Title', 'Message', 'Read', 'Archived'];
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...target.map(n => [
        new Date(n.created_at).toISOString(),
        n.severity, n.category, n.module ?? '', n.title, n.message,
        n.read ? 'Yes' : 'No', n.dismissed_at ? 'Yes' : 'No',
      ].map(escape).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => ([
    { label: 'Unread', value: counts.unread },
    { label: 'Urgent (Critical/High)', value: counts.unread_urgent },
    { label: 'Action required', value: counts.action_required },
    { label: 'Alerts', value: counts.alerts },
  ]), [counts]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notification Centre"
          description="All alerts, tasks and system messages addressed to you"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => { refresh(); setPage(0); }}>
                <RotateCcw className="h-4 w-4 mr-2" />Refresh
              </Button>
              {counts.unread > 0 && (
                <Button size="sm" onClick={async () => { await markAllRead(); toast.success('All notifications marked as read'); }}>
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

        <Tabs value={tab} onValueChange={setTab}>
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
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, message or reference…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {(Object.keys(SEVERITY_META) as NotificationSeverity[]).map(s => (
                <SelectItem key={s} value={s}>{SEVERITY_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {MODULES.map(m => (
                <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="text-xs text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : 'Select all on this page'}
            </span>
            {selected.length > 0 && (
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={bulkRead}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" />Mark read
                </Button>
                {!activeTab.archived && (
                  <Button size="sm" variant="outline" onClick={bulkDismiss}>
                    <Archive className="h-3.5 w-3.5 mr-1.5" />Archive
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {activeTab.unreadOnly ? 'All caught up!' : 'No notifications match these filters'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map(n => {
              const sev = SEVERITY_META[n.severity] ?? SEVERITY_META.medium;
              const link = notificationLink(n.entity_type, n.entity_id, n.metadata);
              return (
                <Card key={n.id} className={!n.read ? 'border-primary/30 bg-primary/5' : ''}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(n.id)}
                      onCheckedChange={() => toggleOne(n.id)}
                      aria-label="Select notification"
                    />
                    <div className={`shrink-0 mt-0.5 rounded-md border p-1.5 ${sev.className}`}>{sev.icon}</div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => open(n)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm ${!n.read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
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
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                        {link && (
                          <span className="text-xs text-primary inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />Open record
                          </span>
                        )}
                        {n.dismissed_at && (
                          <span className="text-xs text-muted-foreground">Archived</span>
                        )}
                      </div>
                    </div>
                    {!n.dismissed_at && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Archive"
                        onClick={async () => {
                          await dismiss([n.id]);
                          setRows(prev => prev.filter(r => r.id !== n.id));
                        }}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {(page > 0 || rows.length === PAGE_SIZE) && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
