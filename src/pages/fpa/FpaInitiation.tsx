import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpAssessmentInitiate } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import { logFpAction } from '@/lib/fpAudit';
import { RequestDeclarationDialog } from '@/components/fit-and-proper/RequestDeclarationDialog';
import {
  FileText,
  RefreshCw,
  Zap,
  CalendarDays,
  Loader2,
  ArrowRight,
  ClipboardList,
  Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PathwayType = 'initial' | 'ongoing_monitoring' | 'triggered' | 'cycle';

interface Pathway {
  type: PathwayType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: {
    border: string;
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    btn: string;
  };
}

interface Individual {
  id: string;
  full_name: string;
  national_id: string | null;
  passport_number: string | null;
}

interface AssessmentRow {
  id: string;
  individual_id: string | null;
  assessment_type: string;
  status: string;
  created_at: string;
  fp_individuals: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PATHWAYS: Pathway[] = [
  {
    type: 'initial',
    label: 'New Licence Application',
    description:
      'Triggered when a new licence application is submitted. Links to application ID.',
    icon: FileText,
    color: {
      border: 'border-blue-200 hover:border-blue-400',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      btn: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  },
  {
    type: 'ongoing_monitoring',
    label: 'Ongoing Monitoring',
    description: 'Periodic reassessment of existing regulated persons.',
    icon: RefreshCw,
    color: {
      border: 'border-emerald-200 hover:border-emerald-400',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
  },
  {
    type: 'triggered',
    label: 'Ad-hoc / Triggered',
    description:
      'Event-triggered assessment: complaint, media alert, or regulator referral.',
    icon: Zap,
    color: {
      border: 'border-orange-200 hover:border-orange-400',
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-800',
      btn: 'bg-orange-500 hover:bg-orange-600 text-white',
    },
  },
  {
    type: 'cycle',
    label: 'Cycle-Based',
    description: 'Scheduled cycle reassessment per regulatory timetable.',
    icon: CalendarDays,
    color: {
      border: 'border-purple-200 hover:border-purple-400',
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-800',
      btn: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  },
];

const TYPE_BADGE: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-800',
  ongoing_monitoring: 'bg-emerald-100 text-emerald-800',
  triggered: 'bg-orange-100 text-orange-800',
  cycle: 'bg-purple-100 text-purple-800',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  determined: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-600',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FpaInitiation() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Initiation dialog state ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPathway, setSelectedPathway] = useState<Pathway | null>(null);

  // Form state
  const [individualSearch, setIndividualSearch] = useState('');
  const [selectedIndividualId, setSelectedIndividualId] = useState('');
  const [triggerNote, setTriggerNote] = useState('');
  const [linkedAppId, setLinkedAppId] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [selectedAppNumber, setSelectedAppNumber] = useState('');

  // ── Declaration request dialog state — RequestDeclarationDialog owns
  // everything else about the flow; this page only needs to know which
  // individual/assessment it's currently targeting. ───────────────────────
  const [declDialogOpen, setDeclDialogOpen] = useState(false);
  const [declAssessmentId, setDeclAssessmentId] = useState('');
  const [declIndividualId, setDeclIndividualId] = useState('');
  const [declIndividualName, setDeclIndividualName] = useState('');
  const [declAssessmentLabel, setDeclAssessmentLabel] = useState('');

  // ── Application ID search ────────────────────────────────────────────────
  const {
    data: appList = [],
    isFetching: searchingApps,
  } = useQuery<{ id: string; application_number: string; license_type: string; status: string }[]>({
    queryKey: ['applications_search', appSearch],
    enabled: appSearch.trim().length >= 2 && !selectedAppNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, application_number, license_type, status')
        .ilike('application_number', `%${appSearch.trim()}%`)
        .not('status', 'in', '(approved,rejected,draft,cancelled)')
        .limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; application_number: string; license_type: string; status: string }[];
    },
  });

  function handleAppSelect(appNum: string) {
    setAppSearch(appNum);
    setSelectedAppNumber(appNum);
    setLinkedAppId(appNum);
  }

  // ── Individual search ────────────────────────────────────────────────────
  const {
    data: individualList = [],
    isFetching: searchingIndividuals,
    isError: searchError,
  } = useQuery<Individual[]>({
    queryKey: ['fp_individuals_search', individualSearch],
    enabled: individualSearch.trim().length >= 2,
    queryFn: async () => {
      // Match on national_id/passport_number as well as name — the dedup
      // this search exists to support (don't create a second fp_individuals
      // row for someone already on file) can miss an existing record whose
      // name is spelled differently but whose identity document matches.
      // Strip commas: PostgREST's .or() uses them as the condition delimiter,
      // so a literal comma in the search text would otherwise break parsing.
      const term = individualSearch.trim().replace(/,/g, '');
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name, national_id, passport_number')
        .or(`full_name.ilike.%${term}%,national_id.ilike.%${term}%,passport_number.ilike.%${term}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Individual[];
    },
  });

  // ── Recent assessments ───────────────────────────────────────────────────
  const {
    data: recentAssessments = [],
    isLoading: loadingAssessments,
    isError: assessmentsError,
  } = useQuery<AssessmentRow[]>({
    queryKey: ['fp_recent_assessments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, individual_id, assessment_type, status, created_at, fp_individuals(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as AssessmentRow[];
    },
  });

  // ── Selected individual's current role (to attach role_id to the new
  // assessment — previously the insert never set it, leaving "which
  // appointment triggered this assessment" modeled in the schema but never
  // populated). Only auto-attaches when the individual has exactly one
  // current role on file; with more than one it's ambiguous which role the
  // assessment concerns, so it's left unset rather than guessed.
  const { data: selectedIndividualRoles = [] } = useQuery<
    Array<{ id: string; licensee_id: string | null; role_type: string | null }>
  >({
    queryKey: ['fp_individual_current_roles', selectedIndividualId],
    enabled: !!selectedIndividualId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, licensee_id, role_type')
        .eq('individual_id', selectedIndividualId)
        .eq('is_current', true);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; licensee_id: string | null; role_type: string | null }>;
    },
  });

  // ── Assessment detail dialog ─────────────────────────────────────────────
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentRow | null>(null);

  function openAssessmentDetail(row: AssessmentRow) {
    setSelectedAssessment(row);
    setDetailDialogOpen(true);
  }

  // ── Open declaration dialog (pre-filled) ─────────────────────────────────
  function openDeclDialog(individualId: string, individualName: string, assessmentId: string, assessmentLabel: string) {
    setDeclAssessmentId(assessmentId);
    setDeclIndividualId(individualId);
    setDeclIndividualName(individualName);
    setDeclAssessmentLabel(assessmentLabel);
    setDeclDialogOpen(true);
  }

  // ── Initiation mutation ──────────────────────────────────────────────────
  const initiateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIndividualId) throw new Error('Select an individual');
      if (!selectedPathway) throw new Error('No pathway selected');

      const declarationData: Record<string, string> = {
        trigger_note: triggerNote,
      };
      const appIdValue = linkedAppId || appSearch.trim();
      if (selectedPathway.type === 'initial' && appIdValue) {
        declarationData.linked_application_id = appIdValue;
      }

      const singleRole = selectedIndividualRoles.length === 1 ? selectedIndividualRoles[0] : null;

      const created = await fpAssessmentInitiate({
        individualId: selectedIndividualId,
        assessmentType: selectedPathway.type,
        declarationData: declarationData,
        roleId: singleRole?.id ?? null,
        licenseeId: singleRole?.licensee_id ?? null,
      });
      return { assessmentId: created.id };
    },
    onSuccess: ({ assessmentId }) => {
      toast.success('Assessment initiated');
      setDialogOpen(false);
      // Capture before resetForm clears them
      const indivId = selectedIndividualId;
      const indivName = individualSearch;
      const pathwayLabel = selectedPathway ? capitalize(selectedPathway.type) : 'Assessment';
      resetForm();
      qc.invalidateQueries({ queryKey: ['fp_recent_assessments'] });
      // Open declaration request dialog pre-filled with the new assessment
      openDeclDialog(indivId, indivName, assessmentId, `${pathwayLabel} · draft`);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to initiate assessment');
    },
  });

  // ── Initiation form helpers ──────────────────────────────────────────────
  function openDialog(pathway: Pathway) {
    setSelectedPathway(pathway);
    resetForm();
    setDialogOpen(true);
  }

  function resetForm() {
    setIndividualSearch('');
    setSelectedIndividualId('');
    setTriggerNote('');
    setLinkedAppId('');
    setAppSearch('');
    setSelectedAppNumber('');
  }

  function handleIndividualSelect(id: string) {
    setSelectedIndividualId(id);
    const found = individualList.find((i) => i.id === id);
    if (found) setIndividualSearch(found.full_name);
  }

  const canSubmit = !!selectedIndividualId && !initiateMutation.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Assessment Initiation"
          description="Initiate Fit & Proper assessments via 4 pathways — FPA-001"
        />

        {/* Pathway tiles — 2x2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PATHWAYS.map((pathway) => {
            const Icon = pathway.icon;
            return (
              <Card
                key={pathway.type}
                className={`border-2 transition-colors duration-150 cursor-default ${pathway.color.border}`}
              >
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-lg p-2.5 flex-shrink-0 ${pathway.color.iconBg}`}>
                      <Icon className={`h-5 w-5 ${pathway.color.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                          {pathway.label}
                        </h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${pathway.color.badgeBg} ${pathway.color.badgeText}`}>
                          {pathway.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {pathway.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button data-rbac="fit_and_proper.edit"
                      size="sm"
                      className={`gap-1.5 text-xs h-8 ${pathway.color.btn}`}
                      onClick={() => openDialog(pathway)}
                    >
                      Initiate
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Initiate Assessment Dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPathway && (
                  <>
                    {(() => {
                      const Icon = selectedPathway.icon;
                      return (
                        <span className={`inline-flex rounded-md p-1.5 ${selectedPathway.color.iconBg}`}>
                          <Icon className={`h-4 w-4 ${selectedPathway.color.iconColor}`} />
                        </span>
                      );
                    })()}
                    Initiate — {selectedPathway.label}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Individual search */}
              <div className="space-y-1.5">
                <Label htmlFor="individual-search">
                  Individual <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="individual-search"
                  placeholder="Type at least 2 characters to search…"
                  value={individualSearch}
                  onChange={(e) => {
                    setIndividualSearch(e.target.value);
                    if (selectedIndividualId) setSelectedIndividualId('');
                  }}
                  autoComplete="off"
                />
                {searchingIndividuals && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </p>
                )}
                {searchError && (
                  <p className="text-xs text-destructive">Search failed. Please try again.</p>
                )}
                {!searchingIndividuals && !searchError && individualSearch.trim().length >= 2 && individualList.length === 0 && (
                  <p className="text-xs text-muted-foreground">No individuals found.</p>
                )}
                {individualList.length > 0 && !selectedIndividualId && (
                  <div className="border rounded-md overflow-hidden max-h-40 overflow-y-auto">
                    {individualList.map((ind) => (
                      <button
                        key={ind.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2"
                        onClick={() => handleIndividualSelect(ind.id)}
                      >
                        <span className="font-medium">{ind.full_name}</span>
                        {(ind.national_id || ind.passport_number) && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {ind.national_id || ind.passport_number}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedIndividualId && (
                  <p className="text-xs text-emerald-700 font-medium">Selected: {individualSearch}</p>
                )}
              </div>

              {/* Assessment type — read-only */}
              <div className="space-y-1.5">
                <Label>Assessment Type</Label>
                <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {selectedPathway ? capitalize(selectedPathway.type) : '—'}
                </div>
              </div>

              {/* Linked application ID — only for initial */}
              {selectedPathway?.type === 'initial' && (
                <div className="space-y-1.5">
                  <Label htmlFor="linked-app-id">Linked Application ID</Label>
                  <Input
                    id="linked-app-id"
                    placeholder="Type 2+ characters to search…"
                    value={appSearch}
                    autoComplete="off"
                    onChange={(e) => {
                      setAppSearch(e.target.value);
                      if (selectedAppNumber) {
                        setSelectedAppNumber('');
                        setLinkedAppId('');
                      }
                    }}
                  />
                  {searchingApps && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </p>
                  )}
                  {!searchingApps && appSearch.trim().length >= 2 && !selectedAppNumber && appList.length === 0 && (
                    <p className="text-xs text-muted-foreground">No applications found.</p>
                  )}
                  {appList.length > 0 && !selectedAppNumber && (
                    <div className="border rounded-md overflow-hidden max-h-48 overflow-y-auto">
                      {appList.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex flex-col gap-0.5"
                          onClick={() => handleAppSelect(app.application_number)}
                        >
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {app.application_number}
                          </span>
                          <span className="text-xs text-muted-foreground truncate w-full" style={{ maxWidth: '330px', whiteSpace: 'normal' }}>
                            {app.license_type}
                            {app.status && (
                              <span className={`ml-2 inline-flex items-center rounded px-1 py-0 text-[10px] font-medium ${
                                app.status === 'approved' ? 'bg-green-100 text-green-700' :
                                app.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {app.status}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedAppNumber && (
                    <p className="text-xs text-emerald-700 font-medium">Selected: {selectedAppNumber}</p>
                  )}
                </div>
              )}

              {/* Trigger note */}
              <div className="space-y-1.5">
                <Label htmlFor="trigger-note">Trigger Note</Label>
                <Textarea
                  id="trigger-note"
                  placeholder="Reason or reference for this assessment…"
                  value={triggerNote}
                  onChange={(e) => setTriggerNote(e.target.value)}
                  className="resize-none h-24"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button data-rbac="fit_and_proper.edit"
                size="sm"
                disabled={!canSubmit}
                onClick={() => initiateMutation.mutate()}
                className="gap-1.5"
              >
                {initiateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Initiate Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Declaration Request Dialog (pre-filled, email-only) ── */}
        <RequestDeclarationDialog
          open={declDialogOpen}
          onOpenChange={setDeclDialogOpen}
          individualId={declIndividualId}
          individualName={declIndividualName}
          assessmentId={declAssessmentId}
          assessmentLabel={declAssessmentLabel}
          onSent={() => qc.invalidateQueries({ queryKey: ['fp_recent_assessments'] })}
        />

        {/* Recent initiations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Recent Initiations
              <span className="text-xs font-normal text-muted-foreground ml-1">Last 20 records</span>
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {loadingAssessments ? (
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assessments…
              </div>
            ) : assessmentsError ? (
              <div className="py-12 text-center text-sm text-destructive">
                Failed to load assessments. Please refresh and try again.
              </div>
            ) : recentAssessments.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No assessments have been initiated yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Individual</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="pr-4 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAssessments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4 font-medium">
                          {row.fp_individuals ? (
                            <Link
                              to={`/fpa/individuals/${row.fp_individuals.id}`}
                              className="text-primary hover:underline underline-offset-4"
                            >
                              {row.fp_individuals.full_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${TYPE_BADGE[row.assessment_type] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {capitalize(row.assessment_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {capitalize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {fmtDate(row.created_at)}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openAssessmentDetail(row)}
                          >
                            View
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Assessment detail dialog ── */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Assessment Details
              </DialogTitle>
            </DialogHeader>
            {selectedAssessment && (
              <div className="space-y-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Individual</span>
                  <span className="font-medium">{selectedAssessment.fp_individuals?.full_name ?? '—'}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${TYPE_BADGE[selectedAssessment.assessment_type] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {capitalize(selectedAssessment.assessment_type)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${STATUS_BADGE[selectedAssessment.status] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {capitalize(selectedAssessment.status)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="tabular-nums">{fmtDate(selectedAssessment.created_at)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assessment ID</span>
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {selectedAssessment.id}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
              {selectedAssessment && selectedAssessment.individual_id && canRequestDeclaration(selectedAssessment.status) && (
                <Button data-rbac="fit_and_proper.edit"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    openDeclDialog(
                      selectedAssessment.individual_id!,
                      selectedAssessment.fp_individuals?.full_name ?? '',
                      selectedAssessment.id,
                      `${capitalize(selectedAssessment.assessment_type)} · ${capitalize(selectedAssessment.status)}`,
                    );
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Request Declaration
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
