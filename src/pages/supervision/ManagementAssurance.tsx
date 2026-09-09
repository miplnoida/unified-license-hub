/**
 * OS-02F — Supervisory Management Assurance & Control.
 *
 * Management assurance over the existing supervisory operating model. Every
 * row is derived from canonical records and explains itself; the screen never
 * changes a risk rating, never opens or closes supervisory action and never
 * duplicates a canonical workflow — it routes the manager into it.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink, RefreshCw, ShieldCheck, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import {
  ASSURANCE_CONDITION_LABELS,
  canonicalRouteFor,
  formatAssuranceDate,
  useAssuranceRegister,
  useAssuranceTrend,
  useRecordConditionReview,
  type AssuranceMatter,
} from '@/hooks/useSupervisoryManagementAssurance';

const DOMAINS = ['PRUDENTIAL', 'AML_CFT', 'MARKET_CONDUCT', 'OPERATIONAL_RESILIENCE', 'GOVERNANCE', 'CYBER', 'CROSS_DOMAIN'];

const DISPOSITIONS = [
  { value: 'ACTION_OPENED', label: 'Supervisory action opened' },
  { value: 'REASSESSMENT_REQUIRED', label: 'Reassessment required' },
  { value: 'COVERED_BY_EXISTING_ACTION', label: 'Existing action already covers this' },
  { value: 'NO_ACTION_REQUIRED', label: 'No additional action required (reason needed)' },
];

/**
 * Canonical link module for the record behind a matter. The server re-validates
 * this claim against the real record (type, entity, domain, signal provenance)
 * and derives the reference itself.
 */
const LINK_MODULE_BY_TABLE: Record<string, string> = {
  supervisory_finding: 'SUPERVISORY_FINDING',
  supervisory_remediation_action: 'SUPERVISORY_REMEDIATION',
  supervisory_attention: 'SUPERVISORY_ATTENTION',
  supervisory_reassessment_requirement: 'REASSESSMENT_REQUIREMENT',
};


function humanise(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function conditionLabel(code: string) {
  return ASSURANCE_CONDITION_LABELS[code] ?? humanise(code);
}

function Tile({
  label, value, active, onClick, tone,
}: { label: string; value: number; active?: boolean; onClick?: () => void; tone?: 'bad' | 'warn' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-xl ${
        tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning-foreground' : ''}`}>
        {value}
      </div>
    </button>
  );
}

function MatterDetail({ matter }: { matter: AssuranceMatter }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const record = useRecordConditionReview();
  const [disposition, setDisposition] = useState<string>('none');
  const [rationale, setRationale] = useState('');
  const [note, setNote] = useState('');
  const drill = canonicalRouteFor(matter);
  const prov = matter.assurance_provenance ?? {};

  const needsRationale = disposition === 'NO_ACTION_REQUIRED';
  const needsLink = ['ACTION_OPENED', 'REASSESSMENT_REQUIRED', 'COVERED_BY_EXISTING_ACTION'].includes(disposition);

  const submit = async () => {
    try {
      await record.mutateAsync({
        signalId: matter.signal_id,
        reviewNote: note || null,
        disposition: disposition === 'none' ? null : disposition,
        dispositionRationale: rationale || null,
        linkedModule: needsLink
          ? (LINK_MODULE_BY_TABLE[matter.action_source_table ?? ''] ?? null)
          : null,
        linkedRecordId: needsLink ? matter.action_record_id : null,
      });

      toast({ title: 'Supervisory review recorded' });
      setRationale(''); setNote(''); setDisposition('none');
    } catch (e) {
      toast({
        title: 'Could not record the review',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">Why is this here?</div>
        <p className="mt-1 text-sm">{matter.assurance_explanation}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {matter.assurance_conditions.map((c) => (
            <Badge key={c} variant="outline">{conditionLabel(c)}</Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Entity</div>
          <div className="text-sm">{matter.entity_name ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Supervisory domain</div>
          <div className="text-sm">{humanise(matter.domain_code)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Condition</div>
          <div className="text-sm">{matter.summary ?? '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {matter.detector_code} · {humanise(matter.condition_state)} · {humanise(matter.severity)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Materiality</div>
          <div className="text-sm">{matter.materiality_reason ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Source record</div>
          <div className="font-mono text-xs">
            {matter.source_table ?? 'not recorded'}{matter.source_reference ? ` · ${matter.source_reference}` : ''}
          </div>
          <div className="font-mono text-xs text-muted-foreground">{matter.source_id ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Observation history</div>
          <div className="text-sm">
            {matter.occurrence_count} observation(s) on {matter.occurrence_days} day(s)
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            first {formatAssuranceDate(matter.first_detected_at)} · last {formatAssuranceDate(matter.last_occurrence_at ?? matter.last_detected_at)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Supervisory review</div>
          <div className="text-sm">
            {matter.is_reviewed
              ? `${matter.reviewed_by_name ?? 'Recorded officer'} on ${formatAssuranceDate(matter.reviewed_at)}`
              : 'Not yet reviewed'}
          </div>
          <div className="text-xs text-muted-foreground">
            {matter.disposition ? humanise(matter.disposition) : 'No disposition recorded'}
          </div>
          {matter.disposition_rationale && (
            <p className="mt-1 text-xs">{matter.disposition_rationale}</p>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Accountable owner</div>
          <div className="text-sm">{matter.owner_name ?? 'Unassigned'}</div>
          <div className="text-xs text-muted-foreground">
            {matter.owner_team_name ?? 'No team'} · {humanise(matter.ownership_scope)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Supervisory response</div>
          <div className="text-sm">
            {matter.action_type
              ? `${humanise(matter.action_type)} ${matter.action_reference ?? ''} · ${humanise(matter.action_status)}`
              : 'None linked to this condition'}
          </div>
          <div className="text-xs text-muted-foreground">
            {matter.action_due_date
              ? `Due ${formatAssuranceDate(matter.action_due_date)} (${matter.due_date_source})`
              : matter.due_date_source ?? 'No canonical due date'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Ageing</div>
          <div className="text-sm">
            {matter.age_days ?? '—'} day(s) old · last supervisory activity{' '}
            {matter.days_since_supervisory_activity == null
              ? 'none recorded'
              : `${matter.days_since_supervisory_activity} day(s) ago`}
          </div>
        </div>
      </div>

      {drill && (
        <Button variant="outline" size="sm" onClick={() => navigate(drill.route)}>
          <ExternalLink className="mr-2 h-4 w-4" /> {drill.label}
        </Button>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Record supervisory review / disposition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            This records an accountable supervisory decision only. It does not create, close or
            change any supervisory action, finding or risk rating — use the canonical workflow for that.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Review note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What did you review and conclude?" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Disposition</Label>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger><SelectValue placeholder="Select disposition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Review only (no disposition yet)</SelectItem>
                {DISPOSITIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsRationale && (
            <div className="space-y-1">
              <Label className="text-xs">Written rationale (required)</Label>
              <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)}
                placeholder="Why is no additional supervisory action required?" />
            </div>
          )}
          {needsLink && !matter.action_record_id && (
            <p className="text-xs text-destructive">
              This disposition must name the canonical supervisory record. None is linked to this
              condition yet — open the canonical workflow first.
            </p>
          )}
          <Button
            size="sm"
            data-rbac="supervisory_spine.review"
            onClick={submit}
            disabled={record.isPending
              || (needsRationale && rationale.trim().length < 10)
              || (needsLink && !matter.action_record_id)}
          >
            Record review
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Provenance</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">
            {JSON.stringify(prov, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ManagementAssurance() {
  const { toast } = useToast();
  const [domain, setDomain] = useState<string>('all');
  const [condition, setCondition] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AssuranceMatter | null>(null);

  const register = useAssuranceRegister({
    domain: domain === 'all' ? null : domain,
    condition: condition === 'all' ? null : condition,
    severity: severity === 'all' ? null : severity,
    search: search.trim() || null,
  });
  const trend = useAssuranceTrend(30);

  const summary = register.data?.summary;
  const rows = register.data?.rows ?? [];
  const policy = register.data?.policy ?? null;

  const tiles = useMemo(() => ([
    { key: 'MATERIAL_AWAITING_REVIEW', label: 'Awaiting review', value: summary?.awaiting_review ?? 0, tone: 'warn' as const },
    { key: 'REVIEWED_NO_DISPOSITION', label: 'Awaiting disposition', value: summary?.reviewed_no_disposition ?? 0 },
    { key: 'UNOWNED_MATTER', label: 'Unowned', value: summary?.unowned ?? 0, tone: 'bad' as const },
    { key: 'RESPONSE_OVERDUE', label: 'Overdue responses', value: summary?.overdue ?? 0, tone: 'bad' as const },
    { key: 'RESPONSE_STALE', label: 'Stale matters', value: summary?.stale ?? 0, tone: 'warn' as const },
    { key: 'REPEATED_CONDITION', label: 'Recurring conditions', value: summary?.repeated ?? 0 },
    { key: 'RECURRENCE_AFTER_ACTION', label: 'Recurrence after action', value: summary?.recurrence_after_action ?? 0, tone: 'bad' as const },
    { key: 'ACTION_CLOSED_CONDITION_PERSISTS', label: 'Closed while condition persists', value: summary?.action_closed_condition_persists ?? 0, tone: 'bad' as const },
    { key: 'MISSING_TRACEABILITY', label: 'Traceability exceptions', value: summary?.missing_traceability ?? 0 },
  ]), [summary]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Management Assurance"
        description="Are material supervisory matters being reviewed, decided, acted on and closed — or becoming stale, recurring, unowned or disconnected from supervisory action?"
        actions={
          <Button variant="outline" size="sm" onClick={() => { register.refetch(); trend.refetch(); toast({ title: 'Refreshed' }); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {register.isError && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {(register.error as Error)?.message ?? 'Assurance could not be loaded.'}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> What requires management attention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {register.isLoading ? <Skeleton className="h-24 w-full" /> : (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((t) => (
                <Tile
                  key={t.key} label={t.label} value={t.value} tone={t.tone}
                  active={condition === t.key}
                  onClick={() => setCondition(condition === t.key ? 'all' : t.key)}
                />
              ))}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {policy
              ? `Timeliness uses each record's own due date. Where none exists, ${policy.code} v${policy.version} (${humanise(policy.config_owner)}, ${policy.resolution === 'DOMAIN_SPECIFIC_POLICY' ? 'domain policy' : 'global policy'}) applies: review within ${policy.awaiting_review_tolerance_days} day(s), supervisory activity within ${policy.stale_activity_tolerance_days} day(s), recurring at ${policy.repeat_occurrence_threshold} observations across ${policy.repeat_distinct_day_threshold} day(s). No statutory service level is implied.`
              : 'No assurance policy version is currently effective — ageing tolerances cannot be applied.'}
          </div>
          {trend.data && (
            <div className="text-xs text-muted-foreground">
              Last {trend.data.window_days} days: {trend.data.new_material_matters} new material matter(s),{' '}
              {trend.data.matters_reviewed} reviewed, {trend.data.matters_dispositioned} dispositioned,{' '}
              {trend.data.conditions_resolved_in_window} condition(s) resolved,{' '}
              {trend.data.closed_actions_followed_by_recurrence} closed response(s) followed by recurrence.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Assurance register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger><SelectValue placeholder="Domain" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {DOMAINS.map((d) => <SelectItem key={d} value={d}>{humanise(d)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue placeholder="Assurance condition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assurance conditions</SelectItem>
                {Object.keys(ASSURANCE_CONDITION_LABELS).map((c) => (
                  <SelectItem key={c} value={c}>{conditionLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {['critical', 'high', 'medium', 'low'].map((s) => (
                  <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Entity, condition or response reference"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {register.isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Assurance condition</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Supervisory response</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead className="text-right">Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        No management assurance exceptions for this filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((m) => (
                    <TableRow key={m.signal_id} className="cursor-pointer" onClick={() => setSelected(m)}>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate text-sm">{m.entity_name ?? '—'}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.summary}</div>
                      </TableCell>
                      <TableCell className="text-xs">{humanise(m.domain_code)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.assurance_conditions.slice(0, 2).map((c) => (
                            <Badge key={c} variant="outline" className="text-[11px]">{conditionLabel(c)}</Badge>
                          ))}
                          {m.assurance_conditions.length > 2 && (
                            <Badge variant="outline" className="text-[11px]">
                              +{m.assurance_conditions.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{humanise(m.severity)}</TableCell>
                      <TableCell className="text-xs">
                        {m.owner_name ?? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <UserX className="h-3 w-3" /> Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.action_type
                          ? `${humanise(m.action_type)} · ${humanise(m.action_status)}`
                          : 'None'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.age_days ?? '—'}d</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.occurrence_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Assurance item</SheetTitle>
          </SheetHeader>
          {selected && <div className="mt-4"><MatterDetail matter={selected} /></div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
