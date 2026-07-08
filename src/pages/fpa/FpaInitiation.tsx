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
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  FileText,
  RefreshCw,
  Zap,
  CalendarDays,
  Loader2,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PathwayType = 'initial' | 'periodic' | 'triggered' | 'cycle';

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
    type: 'periodic',
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
  periodic: 'bg-emerald-100 text-emerald-800',
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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPathway, setSelectedPathway] = useState<Pathway | null>(null);

  // Form state
  const [individualSearch, setIndividualSearch] = useState('');
  const [selectedIndividualId, setSelectedIndividualId] = useState('');
  const [triggerNote, setTriggerNote] = useState('');
  const [linkedAppId, setLinkedAppId] = useState('');

  // Individual search query
  const {
    data: individualList = [],
    isFetching: searchingIndividuals,
    isError: searchError,
  } = useQuery<Individual[]>({
    queryKey: ['fp_individuals_search', individualSearch],
    enabled: individualSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name, national_id')
        .ilike('full_name', `%${individualSearch.trim()}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Individual[];
    },
  });

  // Recent assessments query
  const {
    data: recentAssessments = [],
    isLoading: loadingAssessments,
    isError: assessmentsError,
    error: assessmentsErrorObj,
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

  // Assessment detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentRow | null>(null);

  function openAssessmentDetail(row: AssessmentRow) {
    setSelectedAssessment(row);
    setDetailDialogOpen(true);
  }

  // Insert mutation
  const initiateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIndividualId) throw new Error('Select an individual');
      if (!selectedPathway) throw new Error('No pathway selected');

      const declarationData: Record<string, string> = {
        trigger_note: triggerNote,
      };
      if (selectedPathway.type === 'initial' && linkedAppId) {
        declarationData.linked_application_id = linkedAppId;
      }

      const { error } = await supabase.from('fp_assessments').insert({
        individual_id: selectedIndividualId,
        assessment_type: selectedPathway.type,
        status: 'draft',
        declaration_data: declarationData,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Assessment initiated');
      setDialogOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['fp_recent_assessments'] });
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to initiate assessment');
    },
  });

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
  }

  function handleIndividualSelect(id: string) {
    setSelectedIndividualId(id);
    const found = individualList.find((i) => i.id === id);
    if (found) setIndividualSearch(found.full_name);
  }

  const canSubmit =
    !!selectedIndividualId && !initiateMutation.isPending;

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
                    <div
                      className={`rounded-lg p-2.5 flex-shrink-0 ${pathway.color.iconBg}`}
                    >
                      <Icon className={`h-5 w-5 ${pathway.color.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                          {pathway.label}
                        </h3>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${pathway.color.badgeBg} ${pathway.color.badgeText}`}
                        >
                          {pathway.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {pathway.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
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

        {/* Initiate Assessment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPathway && (
                  <>
                    {(() => {
                      const Icon = selectedPathway.icon;
                      return (
                        <span
                          className={`inline-flex rounded-md p-1.5 ${selectedPathway.color.iconBg}`}
                        >
                          <Icon
                            className={`h-4 w-4 ${selectedPathway.color.iconColor}`}
                          />
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
                  <p className="text-xs text-destructive">
                    Search failed. Please try again.
                  </p>
                )}
                {!searchingIndividuals &&
                  !searchError &&
                  individualSearch.trim().length >= 2 &&
                  individualList.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No individuals found.
                    </p>
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
                        {ind.national_id && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {ind.national_id}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedIndividualId && (
                  <p className="text-xs text-emerald-700 font-medium">
                    Selected: {individualSearch}
                  </p>
                )}
              </div>

              {/* Assessment type — pre-filled, read-only */}
              <div className="space-y-1.5">
                <Label>Assessment Type</Label>
                <div className="flex items-center h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {selectedPathway
                    ? capitalize(selectedPathway.type)
                    : '—'}
                </div>
              </div>

              {/* Linked application ID — only for initial */}
              {selectedPathway?.type === 'initial' && (
                <div className="space-y-1.5">
                  <Label htmlFor="linked-app-id">Linked Application ID</Label>
                  <Input
                    id="linked-app-id"
                    placeholder="e.g. APP-2024-0042"
                    value={linkedAppId}
                    onChange={(e) => setLinkedAppId(e.target.value)}
                  />
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={() => initiateMutation.mutate()}
                className="gap-1.5"
              >
                {initiateMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Initiate Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Recent initiations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Recent Initiations
              <span className="text-xs font-normal text-muted-foreground ml-1">
                Last 20 records
              </span>
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
                            <span className="text-muted-foreground italic text-xs">
                              Unknown
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${
                              TYPE_BADGE[row.assessment_type] ??
                              'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {capitalize(row.assessment_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${
                              STATUS_BADGE[row.status] ??
                              'bg-slate-100 text-slate-700'
                            }`}
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

        {/* Assessment detail inline dialog */}
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
                  <span className="font-medium">
                    {selectedAssessment.fp_individuals?.full_name ?? '—'}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${
                      TYPE_BADGE[selectedAssessment.assessment_type] ??
                      'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {capitalize(selectedAssessment.assessment_type)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${
                      STATUS_BADGE[selectedAssessment.status] ??
                      'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {capitalize(selectedAssessment.status)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="tabular-nums">
                    {fmtDate(selectedAssessment.created_at)}
                  </span>
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
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
