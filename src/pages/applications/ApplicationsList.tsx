import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { PaymentVerificationDialog } from '@/components/applications/PaymentVerificationDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { PlusCircle, Search, Eye, Loader2, FileText, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, MessageSquare, Pencil, Ban, Layers, GitBranch, GitCompareArrows, X } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SubmissionCompareDialog } from '@/components/form-builder/SubmissionCompareDialog';

const statusBadgeVariant = (s: string) => {
  switch (s) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'submitted': return 'submitted';
    case 'in_progress': return 'under-review';
    case 'resubmission_requested': return 'returned';
    case 'query_raised': return 'returned';
    case 'cancelled': return 'destructive';
    default: return 'draft';
  }
};

const licenseTypeBadgeVariant = (t: string) => {
  if (t.toLowerCase().includes('pre')) return 'submitted';
  if (t.toLowerCase().includes('post')) return 'approved';
  return 'secondary';
};

const paymentBadgeVariant = (s: string) => {
  switch (s) {
    case 'success': return 'approved';
    case 'pending': return 'pending';
    case 'failed': return 'rejected';
    default: return 'draft';
  }
};

interface Application {
  id: string;
  application_number: string;
  applicant_id: string;
  license_type: string;
  status: ApplicationStatus;
  data: Record<string, any>;
  submitted_at: string | null;
  created_at: string;
  form_version_id?: string | null;
}

interface FormVersionRow {
  id: string;
  template_id: string;
  version: number;
  semantic_version: string | null;
  status: string;
  effective_from: string | null;
  effective_until: string | null;
  published_at: string | null;
}

interface FormTemplateRow {
  id: string;
  name: string;
}

interface ActionEvent {
  id: string;
  application_id: string;
  action: string;
  comments: string | null;
  actor_id: string;
  created_at: string;
  actor_email?: string;
}

interface PaymentInfo {
  id?: string;
  application_id: string;
  amount: number;
  status: string;
  currency: string;
  payment_method?: string;
  transaction_ref?: string;
  created_at?: string;
  paid_at?: string;
}

type SearchMode = 'contains' | 'starts_with' | 'exact';

type GroupByField = 'license_type' | 'sector' | 'sub_sector';

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'license_type', label: 'License Type' },
  { value: 'sector', label: 'Sector' },
  { value: 'sub_sector', label: 'Sub-Sector' },
];

const TAB_STATUS_MAP: Record<string, ApplicationStatus[]> = {
  submitted: ['submitted', 'in_progress'],
  resubmission: ['resubmission_requested'],
  accepted: ['approved'],
  rejected: ['rejected'],
};

const PAGE_SIZE = 10;

export default function ApplicationsList() {
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const [subSectors, setSubSectors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, string>>({});
  const [allActions, setAllActions] = useState<ActionEvent[]>([]);
  const [payments, setPayments] = useState<Record<string, PaymentInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('contains');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentApp, setSelectedPaymentApp] = useState<{ payment: PaymentInfo; applicantName: string; applicationNumber: string; applicantId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [groupByOrder, setGroupByOrder] = useState<GroupByField[]>(['license_type', 'sector', 'sub_sector']);
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [versions, setVersions] = useState<Record<string, FormVersionRow>>({});
  const [templates, setTemplates] = useState<Record<string, FormTemplateRow>>({});
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [versionSort, setVersionSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [comparePayload, setComparePayload] = useState<{
    formName: string;
    left: { id: string; label: string; versionId: string | null; data: Record<string, any> };
    right: { id: string; label: string; versionId: string | null; data: Record<string, any> };
  } | null>(null);
  const isInternal = !!user && (enforceDynamic ? hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [appRes, profRes, preLicRes, actionsRes, sectorRes, subSectorRes, catRes, svcRes, payRes, fvRes, ftRes] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, email'),
        supabase.from('pre_license_users' as any).select('id, full_name, email'),
        supabase.from('approval_actions').select('*').order('created_at', { ascending: true }),
        supabase.from('sectors').select('id, name'),
        supabase.from('sub_sectors').select('id, name'),
        supabase.from('categories').select('id, name'),
        supabase.from('services').select('id, name'),
        supabase.from('payments').select('id, application_id, amount, status, currency, payment_method, transaction_ref, created_at, paid_at'),
        supabase.from('form_versions').select('id, template_id, version, semantic_version, status, effective_from, effective_until, published_at'),
        supabase.from('form_templates').select('id, name'),
      ]);
      if (appRes.data) setApplications(appRes.data as any);
      const allProfiles: any[] = [...(profRes.data || []), ...(preLicRes.data || [])];
      setProfiles(allProfiles);

      if (sectorRes.data) setSectors(Object.fromEntries((sectorRes.data as any[]).map(s => [s.id, s.name])));
      if (subSectorRes.data) setSubSectors(Object.fromEntries((subSectorRes.data as any[]).map(s => [s.id, s.name])));
      if (catRes.data) setCategories(Object.fromEntries((catRes.data as any[]).map(c => [c.id, c.name])));
      if (svcRes.data) setServices(Object.fromEntries((svcRes.data as any[]).map(s => [s.id, s.name])));
      if (fvRes.data) setVersions(Object.fromEntries((fvRes.data as any[]).map(v => [v.id, v as FormVersionRow])));
      if (ftRes.data) setTemplates(Object.fromEntries((ftRes.data as any[]).map(t => [t.id, t as FormTemplateRow])));

      if (payRes.data) {
        const payMap: Record<string, PaymentInfo> = {};
        (payRes.data as any[]).forEach(p => {
          if (p.application_id) payMap[p.application_id] = p;
        });
        setPayments(payMap);
      }
      if (actionsRes.data) {
        const emailMap: Record<string, string> = {};
        allProfiles.forEach((p: any) => { emailMap[p.id] = p.email || p.full_name; });
        setAllActions((actionsRes.data as any[]).map(a => ({
          ...a,
          actor_email: emailMap[a.actor_id] || a.actor_id,
        })));
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);


  const getApplicantName = (id: string) => profiles.find(p => p.id === id)?.full_name || '—';

  const getAppActions = (appId: string) => allActions.filter(a => a.application_id === appId);

  const resolveField = (app: Application, field: string): string => {
    const data = app.data as any;
    if (!data) return '—';
    const id = data[field];
    if (!id) return '—';
    switch (field) {
      case 'sector_id': return sectors[id] || id;
      case 'sub_sector_id': return subSectors[id] || id;
      case 'category_id': return categories[id] || id;
      case 'service_id': return services[id] || id;
      default: return String(id);
    }
  };

  /** Returns the form-template → version-id map embedded in app.data, with backward-compat for legacy form_version_id. */
  const getAppVersionEntries = (app: Application): { templateId: string; versionId: string | null }[] => {
    const data = (app.data || {}) as any;
    const map: Record<string, string> = data.form_version_ids || {};
    const templateIds: string[] = Array.isArray(data.form_template_ids) ? data.form_template_ids : Object.keys(map);
    if (templateIds.length === 0 && app.form_version_id) {
      const v = versions[app.form_version_id];
      return [{ templateId: v?.template_id || '—', versionId: app.form_version_id }];
    }
    return templateIds.map(tid => ({ templateId: tid, versionId: map[tid] || null }));
  };

  const formatVersionLabel = (versionId: string | null): string => {
    if (!versionId) return 'v?';
    const v = versions[versionId];
    if (!v) return 'v?';
    return v.semantic_version || `v${v.version}`;
  };

  const versionStatusVariant = (status?: string): any => {
    switch (status) {
      case 'published': return 'approved';
      case 'draft': return 'draft';
      case 'archived': return 'secondary';
      case 'scheduled': return 'pending';
      default: return 'outline';
    }
  };

  /** Distinct versions referenced by current applications — for filter dropdown */
  const versionFilterOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; templateName: string }>();
    applications.forEach(app => {
      getAppVersionEntries(app).forEach(({ templateId, versionId }) => {
        if (!versionId || seen.has(versionId)) return;
        const tmpl = templates[templateId]?.name || 'Form';
        seen.set(versionId, { id: versionId, label: formatVersionLabel(versionId), templateName: tmpl });
      });
    });
    return Array.from(seen.values()).sort((a, b) =>
      `${a.templateName} ${a.label}`.localeCompare(`${b.templateName} ${b.label}`)
    );
  }, [applications, versions, templates]);

  const matchSearch = (value: string, query: string, mode: SearchMode): boolean => {
    const v = value.toLowerCase();
    const q = query.toLowerCase();
    switch (mode) {
      case 'starts_with': return v.startsWith(q);
      case 'exact': return v === q;
      case 'contains': default: return v.includes(q);
    }
  };

  const filtered = useMemo(() => {
    const list = applications.filter(a => {
      // Hide draft and in_progress from internal/admin users
      if (isInternal && ['draft', 'in_progress'].includes(a.status)) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'resubmission_requested') {
          if (a.status !== 'resubmission_requested' && a.status !== 'query_raised') return false;
        } else if (a.status !== statusFilter) return false;
      }
      const versionEntries = getAppVersionEntries(a);
      if (versionFilter !== 'all') {
        if (!versionEntries.some(e => e.versionId === versionFilter)) return false;
      }
      if (search) {
        const q = search;
        const name = getApplicantName(a.applicant_id);
        const sector = resolveField(a, 'sector_id');
        const subSector = resolveField(a, 'sub_sector_id');
        const versionLabels = versionEntries.map(e => formatVersionLabel(e.versionId)).join(' ');
        if (
          !matchSearch(a.application_number, q, searchMode) &&
          !matchSearch(name, q, searchMode) &&
          !matchSearch(sector, q, searchMode) &&
          !matchSearch(subSector, q, searchMode) &&
          !matchSearch(versionLabels, q, searchMode)
        ) return false;
      }
      return true;
    });

    if (versionSort !== 'none') {
      const versionScore = (app: Application): number => {
        const entries = getAppVersionEntries(app);
        const nums = entries.map(e => versions[e.versionId || '']?.version ?? -1);
        return nums.length ? Math.max(...nums) : -1;
      };
      list.sort((a, b) => {
        const diff = versionScore(a) - versionScore(b);
        return versionSort === 'asc' ? diff : -diff;
      });
    }
    return list;
  }, [applications, isInternal, statusFilter, search, searchMode, profiles, sectors, subSectors, versions, templates, versionFilter, versionSort]);

  const totalPages = groupingEnabled ? 0 : Math.ceil(filtered.length / PAGE_SIZE);
  const paged = groupingEnabled ? filtered : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const visibleApps = isInternal ? applications.filter(a => !['draft', 'in_progress'].includes(a.status)) : applications;
  const approved = visibleApps.filter(a => a.status === 'approved').length;
  const pending = visibleApps.filter(a => !['approved', 'rejected', 'cancelled'].includes(a.status)).length;
  const rejected = visibleApps.filter(a => a.status === 'rejected').length;

  const resolveGroupValue = (app: Application, field: GroupByField): string => {
    const data = app.data as any;
    switch (field) {
      case 'license_type':
        return data?.service_id ? 'Post Licensee' : data?.category_id ? 'Pre Licensee' : 'Unclassified';
      case 'sector':
        return data?.sector_id ? (sectors[data.sector_id] || 'Unknown Sector') : 'No Sector';
      case 'sub_sector':
        return data?.sub_sector_id ? (subSectors[data.sub_sector_id] || 'Unknown Sub-Sector') : 'No Sub-Sector';
      default:
        return 'Other';
    }
  };

  const groupedData = useMemo(() => {
    if (!groupingEnabled) return null;
    type GroupNode = { label: string; children: GroupNode[] | Application[] };
    
    const buildGroups = (items: Application[], levels: GroupByField[], depth: number): GroupNode[] => {
      if (depth >= levels.length) return [];
      const field = levels[depth];
      const map = new Map<string, Application[]>();
      items.forEach(app => {
        const key = resolveGroupValue(app, field);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(app);
      });
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, apps]) => ({
          label,
          children: depth + 1 < levels.length ? buildGroups(apps, levels, depth + 1) : apps,
        }));
    };
    return buildGroups(filtered, groupByOrder, 0);
  }, [filtered, groupingEnabled, groupByOrder, sectors, subSectors]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const moveGroupField = (field: GroupByField, direction: 'up' | 'down') => {
    setGroupByOrder(prev => {
      const idx = prev.indexOf(field);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
    setCollapsedGroups(new Set());
  };

  const renderAppRow = (app: Application) => {
    const actions = getAppActions(app.id);
    const isExpanded = expandedId === app.id;
    const sectorName = resolveField(app, 'sector_id');
    const subSectorName = resolveField(app, 'sub_sector_id');
    const categoryName = resolveField(app, 'category_id');
    const serviceName = resolveField(app, 'service_id');
    const catSvc = [categoryName, serviceName].filter(v => v !== '—').join(' / ') || '—';
    const payment = payments[app.id];
    const versionEntries = getAppVersionEntries(app);
    const isSelectedForCompare = selectedForCompare.includes(app.id);
    return (
      <Fragment key={app.id}>
        <TableRow
          className="cursor-pointer hover:bg-muted/50"
          onClick={() => {
            if (compareMode) {
              setSelectedForCompare(prev => {
                if (prev.includes(app.id)) return prev.filter(id => id !== app.id);
                if (prev.length >= 2) {
                  toast.info('Only two submissions can be compared. Deselect one first.');
                  return prev;
                }
                return [...prev, app.id];
              });
              return;
            }
            navigate(`/applications/${app.id}`);
          }}
        >
          {compareMode && (
            <TableCell onClick={e => e.stopPropagation()}>
              <Checkbox
                checked={isSelectedForCompare}
                onCheckedChange={(v) => {
                  setSelectedForCompare(prev => {
                    if (v) {
                      if (prev.includes(app.id)) return prev;
                      if (prev.length >= 2) {
                        toast.info('Only two submissions can be compared.');
                        return prev;
                      }
                      return [...prev, app.id];
                    }
                    return prev.filter(id => id !== app.id);
                  });
                }}
                aria-label={`Select ${app.application_number} for comparison`}
              />
            </TableCell>
          )}
          <TableCell className="font-mono font-medium text-sm">{app.application_number}</TableCell>
          <TableCell>{getApplicantName(app.applicant_id)}</TableCell>
          <TableCell className="text-sm">
            {(app.data as any)?.service_id ? 'Post Licensee' : (app.data as any)?.category_id ? 'Pre Licensee' : '—'}
          </TableCell>
          <TableCell className="text-sm">{sectorName}</TableCell>
          <TableCell className="text-sm">{subSectorName}</TableCell>
          <TableCell className="text-sm">
            {versionEntries.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <Popover>
                <PopoverTrigger asChild onClick={e => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1.5 text-[11px] font-normal"
                    title="View form/version details"
                  >
                    <FileText className="h-3 w-3" />
                    <span>{versionEntries.length} {versionEntries.length === 1 ? 'Form' : 'Forms'}</span>
                    <span className="text-muted-foreground">·</span>
                    <GitBranch className="h-3 w-3" />
                    <span>{versionEntries.filter(e => e.versionId).length} {versionEntries.filter(e => e.versionId).length === 1 ? 'Ver' : 'Vers'}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[360px] p-0"
                  align="start"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <p className="text-xs font-semibold">Submitted Forms & Versions</p>
                    <p className="text-[10px] text-muted-foreground">{app.application_number}</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {versionEntries.map(({ templateId, versionId }) => {
                      const tmplName = templates[templateId]?.name || 'Form';
                      return (
                        <div key={templateId} className="px-3 py-2 space-y-1">
                          <p className="text-xs font-medium truncate" title={tmplName}>{tmplName}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              <GitBranch className="h-3 w-3 mr-1" />{formatVersionLabel(versionId)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isInternal && versionEntries.length > 0 && (
                    <div className="px-3 py-2 border-t bg-muted/20">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start text-xs"
                        onClick={() => {
                          if (!compareMode) setCompareMode(true);
                          setSelectedForCompare(prev => {
                            if (prev.includes(app.id)) return prev;
                            if (prev.length >= 2) {
                              toast.info('Two submissions already selected. Open Compare to proceed.');
                              return prev;
                            }
                            const next = [...prev, app.id];
                            if (next.length === 2) setComparePickerOpen(true);
                            return next;
                          });
                        }}
                      >
                        <GitCompareArrows className="h-3.5 w-3.5 mr-2" />
                        {selectedForCompare.includes(app.id)
                          ? 'Selected for compare'
                          : selectedForCompare.length === 1
                            ? 'Compare with selected submission'
                            : 'Select for comparison'}
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </TableCell>
          <TableCell className="text-sm max-w-[180px] truncate">{catSvc}</TableCell>
          <TableCell>
            {payment ? (
              <div
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                onClick={e => {
                  e.stopPropagation();
                  setSelectedPaymentApp({
                    payment,
                    applicantName: getApplicantName(app.applicant_id),
                    applicationNumber: app.application_number,
                    applicantId: app.applicant_id,
                  });
                  setPaymentDialogOpen(true);
                }}
              >
                <span className="text-xs font-medium">{payment.currency === 'USD' ? '$' : payment.currency}{Number(payment.amount).toLocaleString()}</span>
                <Badge variant={paymentBadgeVariant(payment.status) as any} className="text-[10px]">
                  {payment.status === 'success' ? 'Paid' : payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </Badge>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant={statusBadgeVariant(app.status) as any} className="text-xs">
              {APPLICATION_STATUS_LABELS[app.status] || app.status}
            </Badge>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
            {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : new Date(app.created_at).toLocaleDateString()}
          </TableCell>
          <TableCell>
            {actions.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : app.id); }}
              >
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs">{actions.length}</span>
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/applications/${app.id}`); }}>
                <Eye className="h-4 w-4 mr-1" />View
              </Button>
              {!isInternal && ['draft', 'resubmission_requested', 'query_raised'].includes(app.status) && (
                <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/applications/${app.id}?mode=edit`); }}>
                  <Pencil className="h-4 w-4 mr-1" />Edit
                </Button>
              )}
              {!isInternal && ['draft', 'resubmission_requested', 'query_raised'].includes(app.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={async e => {
                    e.stopPropagation();
                    if (!window.confirm('Are you sure you want to cancel this application?')) return;
                    const { error } = await supabase.from('applications').update({ status: 'cancelled' } as any).eq('id', app.id);
                    if (error) { toast.error(error.message); return; }
                    await supabase.from('approval_actions').insert({
                      application_id: app.id, action: 'cancelled', actor_id: user!.id,
                      comments: 'Application cancelled by applicant',
                    } as any);
                    toast.success('Application cancelled');
                    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'cancelled' as ApplicationStatus } : a));
                  }}
                >
                  <Ban className="h-4 w-4 mr-1" />Cancel
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && actions.length > 0 && (
          <TableRow key={`${app.id}-history`}>
            <TableCell colSpan={compareMode ? 13 : 12} className="bg-muted/30 p-4">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Application History</p>
                {actions.map(evt => (
                  <div key={evt.id} className="flex gap-3 items-start border-l-2 border-primary/30 pl-3 py-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {evt.action.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(evt.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">by {evt.actor_email}</p>
                      {evt.comments && (
                        <p className="text-xs mt-1 italic text-muted-foreground border-l-2 border-muted pl-2">
                          "{evt.comments}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    );
  };

  type GroupNode = { label: string; children: GroupNode[] | Application[] };

  const isAppArray = (children: GroupNode[] | Application[]): children is Application[] => {
    return children.length === 0 || 'application_number' in children[0];
  };

  const countApps = (node: GroupNode): number => {
    if (isAppArray(node.children)) return node.children.length;
    return (node.children as GroupNode[]).reduce((sum, c) => sum + countApps(c), 0);
  };

  const renderGrouped = (nodes: GroupNode[], depth: number, parentKey: string): React.ReactNode => {
    const isLeafLevel = depth === groupByOrder.length - 1;
    return (
      <div className={depth === 0 ? 'rounded-lg border bg-card divide-y' : 'divide-y border-l border-border/60 ml-4'}>
        {nodes.map(node => {
          const groupKey = `${parentKey}/${node.label}`;
          const isCollapsed = collapsedGroups.has(groupKey);
          const count = countApps(node);
          const fieldLabel = GROUP_BY_OPTIONS.find(o => o.value === groupByOrder[depth])?.label || '';

          return (
            <div key={groupKey}>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
                onClick={() => toggleGroup(groupKey)}
                title={`${fieldLabel}: ${node.label}`}
              >
                {isCollapsed
                  ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className={`truncate ${depth === 0 ? 'text-sm font-semibold' : 'text-xs font-medium'} text-foreground`}>
                  {node.label}
                </span>
                <span className="text-[11px] text-muted-foreground">({count})</span>
              </button>
              {!isCollapsed && (
                isAppArray(node.children) ? (
                  <div className="bg-muted/10 px-2 py-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {compareMode && <TableHead className="w-10"></TableHead>}
                          <TableHead>Application #</TableHead>
                          <TableHead>Applicant</TableHead>
                          <TableHead>License Type</TableHead>
                          <TableHead>Sector</TableHead>
                          <TableHead>Sub Sector</TableHead>
                          <TableHead>Form Version</TableHead>
                          <TableHead>Category / Service</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>History</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {node.children.map(app => renderAppRow(app))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="pb-1">
                    {renderGrouped(node.children as GroupNode[], depth + 1, groupKey)}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = () => (
    <>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {compareMode && <TableHead className="w-10"></TableHead>}
                  <TableHead>Application #</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>License Type</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Sub Sector</TableHead>
                  <TableHead
                    className={versionSort !== 'none' ? 'cursor-pointer select-none' : 'cursor-pointer select-none'}
                    onClick={() => setVersionSort(s => s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none')}
                    title="Click to sort by version"
                  >
                    Form Version {versionSort === 'asc' ? '▲' : versionSort === 'desc' ? '▼' : ''}
                  </TableHead>
                  <TableHead>Category / Service</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>History</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={compareMode ? 13 : 12} className="text-center text-muted-foreground py-12">
                      No applications found.
                    </TableCell>
                  </TableRow>
                ) : paged.map(app => renderAppRow(app))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'License Requests' : 'My Applications'}
          description={isInternal ? 'All pre-license and post-license requests' : 'View and manage your license applications'}
          actions={
            !isInternal && (
              <Button onClick={() => navigate('/applications/new')}>
                <PlusCircle className="h-4 w-4 mr-2" />New Application
              </Button>
            )
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Requests" value={visibleApps.length} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Approved" value={approved} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value={pending} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Rejected" value={rejected} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>

        {/* Search & Filter Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by App #, Company, Sector, Sub Sector, Version..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={searchMode} onValueChange={v => { setSearchMode(v as SearchMode); setPage(0); }}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="starts_with">Starts With</SelectItem>
                  <SelectItem value="exact">Exact Match</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {!isInternal && <SelectItem value="draft">Draft</SelectItem>}
                  <SelectItem value="submitted">Submitted</SelectItem>
                  {!isInternal && <SelectItem value="in_progress">In Progress</SelectItem>}
                  <SelectItem value="resubmission_requested">Resubmission Requested</SelectItem>
                  <SelectItem value="approved">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {isInternal && (
                <Select value={versionFilter} onValueChange={v => { setVersionFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by form version" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Form Versions</SelectItem>
                    {versionFilterOptions.map(opt => (
                      <SelectItem key={opt.id} value={opt.id}>{opt.templateName} — {opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant={groupingEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setGroupingEnabled(g => !g); setPage(0); setCollapsedGroups(new Set()); }}
              >
                <Layers className="h-4 w-4 mr-2" />
                {groupingEnabled ? 'Grouped' : 'Group By'}
              </Button>
              {isInternal && (
                <Button
                  variant={compareMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setCompareMode(m => !m);
                    setSelectedForCompare([]);
                  }}
                >
                  <GitCompareArrows className="h-4 w-4 mr-2" />
                  {compareMode ? 'Comparing' : 'Compare'}
                </Button>
              )}
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>

            {compareMode && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <GitCompareArrows className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">
                  Select two submissions to compare ({selectedForCompare.length}/2 selected)
                </span>
                {selectedForCompare.map(id => {
                  const a = applications.find(x => x.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1">
                      {a?.application_number || id}
                      <button
                        onClick={() => setSelectedForCompare(prev => prev.filter(x => x !== id))}
                        className="hover:text-destructive"
                        aria-label="Remove from comparison"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="default"
                  disabled={selectedForCompare.length !== 2}
                  onClick={() => setComparePickerOpen(true)}
                >
                  Compare submissions
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Grouping configuration */}
            {groupingEnabled && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Grouping Priority (drag order):</p>
                <div className="flex flex-wrap items-center gap-2">
                  {groupByOrder.map((field, idx) => {
                    const opt = GROUP_BY_OPTIONS.find(o => o.value === field);
                    return (
                      <div key={field} className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-3 py-1.5">
                        <span className="text-xs font-medium">{idx + 1}. {opt?.label}</span>
                        <Button
                          variant="ghost" size="sm" className="h-5 w-5 p-0"
                          disabled={idx === 0}
                          onClick={() => moveGroupField(field, 'up')}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-5 w-5 p-0"
                          disabled={idx === groupByOrder.length - 1}
                          onClick={() => moveGroupField(field, 'down')}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Application List */}
        <div className="space-y-4">
          {groupingEnabled && groupedData ? renderGrouped(groupedData, 0, '') : renderTable()}
        </div>

        <PaymentVerificationDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          payment={selectedPaymentApp?.payment || null}
          applicantName={selectedPaymentApp?.applicantName || ''}
          applicationNumber={selectedPaymentApp?.applicationNumber || ''}
          applicantId={selectedPaymentApp?.applicantId || ''}
          isAdminView={isInternal}
          onVerified={() => {
            setRefreshKey(k => k + 1);
          }}
        />

        <CompareSubmissionPicker
          open={comparePickerOpen}
          onOpenChange={setComparePickerOpen}
          appA={applications.find(a => a.id === selectedForCompare[0]) || null}
          appB={applications.find(a => a.id === selectedForCompare[1]) || null}
          templates={templates}
          getApplicantName={getApplicantName}
          getAppVersionEntries={getAppVersionEntries}
          onConfirm={(payload) => {
            setComparePayload(payload);
            setComparePickerOpen(false);
            setCompareDialogOpen(true);
          }}
        />

        {comparePayload && (
          <SubmissionCompareDialog
            open={compareDialogOpen}
            onOpenChange={setCompareDialogOpen}
            formName={comparePayload.formName}
            left={comparePayload.left}
            right={comparePayload.right}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

interface PickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appA: Application | null;
  appB: Application | null;
  templates: Record<string, FormTemplateRow>;
  getApplicantName: (id: string) => string;
  getAppVersionEntries: (app: Application) => { templateId: string; versionId: string | null }[];
  onConfirm: (payload: {
    formName: string;
    left: { id: string; label: string; versionId: string | null; data: Record<string, any> };
    right: { id: string; label: string; versionId: string | null; data: Record<string, any> };
  }) => void;
}

function CompareSubmissionPicker({
  open, onOpenChange, appA, appB, templates,
  getApplicantName, getAppVersionEntries, onConfirm,
}: PickerProps) {
  const entriesA = appA ? getAppVersionEntries(appA) : [];
  const entriesB = appB ? getAppVersionEntries(appB) : [];

  // Templates present in BOTH submissions are easy 1-click compare; the rest can still be picked individually.
  const templateIdsA = new Set(entriesA.map(e => e.templateId));
  const templateIdsB = new Set(entriesB.map(e => e.templateId));
  const sharedTemplateIds = Array.from(templateIdsA).filter(t => templateIdsB.has(t));
  const allTemplateIds = Array.from(new Set([...templateIdsA, ...templateIdsB]));

  const [templateA, setTemplateA] = useState<string>('');
  const [templateB, setTemplateB] = useState<string>('');

  // Auto-pick when shared templates exist
  useEffect(() => {
    if (!open) return;
    if (sharedTemplateIds.length > 0) {
      setTemplateA(sharedTemplateIds[0]);
      setTemplateB(sharedTemplateIds[0]);
    } else {
      setTemplateA(entriesA[0]?.templateId || '');
      setTemplateB(entriesB[0]?.templateId || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appA?.id, appB?.id]);

  if (!appA || !appB) return null;

  const dataFor = (app: Application, templateId: string): Record<string, any> => {
    const data = (app.data || {}) as any;
    const fd = data.forms_data || {};
    if (fd[templateId] && typeof fd[templateId] === 'object') return fd[templateId];
    // Legacy: data itself is the single-form payload
    return data;
  };

  const versionIdFor = (app: Application, templateId: string): string | null => {
    const data = (app.data || {}) as any;
    const map = data.form_version_ids || {};
    return map[templateId] || (app as any).form_version_id || null;
  };

  const handleConfirm = () => {
    if (!templateA || !templateB) {
      toast.error('Please select a form for each submission.');
      return;
    }
    const formName = templates[templateA]?.name || templates[templateB]?.name || 'Form';
    onConfirm({
      formName,
      left: {
        id: appA.id,
        label: `${appA.application_number} (${getApplicantName(appA.applicant_id)})`,
        versionId: versionIdFor(appA, templateA),
        data: dataFor(appA, templateA),
      },
      right: {
        id: appB.id,
        label: `${appB.application_number} (${getApplicantName(appB.applicant_id)})`,
        versionId: versionIdFor(appB, templateB),
        data: dataFor(appB, templateB),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare submissions</DialogTitle>
          <DialogDescription>
            Choose which form to compare from each submission. Shared templates are listed first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {appA.application_number} — {getApplicantName(appA.applicant_id)}
            </p>
            <Select value={templateA} onValueChange={setTemplateA}>
              <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
              <SelectContent>
                {entriesA.map(({ templateId, versionId }) => (
                  <SelectItem key={templateId} value={templateId}>
                    {templates[templateId]?.name || 'Form'} — {versionId ? 'v' : 'no version'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {appB.application_number} — {getApplicantName(appB.applicant_id)}
            </p>
            <Select value={templateB} onValueChange={setTemplateB}>
              <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
              <SelectContent>
                {entriesB.map(({ templateId, versionId }) => (
                  <SelectItem key={templateId} value={templateId}>
                    {templates[templateId]?.name || 'Form'} — {versionId ? 'v' : 'no version'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sharedTemplateIds.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            These submissions don't share a common form template. Comparison may show all fields as added/removed.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Open comparison</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
