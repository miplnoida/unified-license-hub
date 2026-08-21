/**
 * P04 A.9–A.13 — Adverse matter panel (suspension, revocation, reinstatement,
 * surrender, expiry/lapse).
 *
 * Everything shown here is server truth from `license_adverse_matter_case()`:
 * the matter spine with provenance, the due-process timeline (notice →
 * representation window → evidence review → decision), the notices issued, the
 * representations received and the formal decision records with appeal rights.
 * The panel computes nothing and offers no shortcuts — steps are taken in
 * Current Step, which submits through `license_lifecycle_step`.
 */
import { AlertTriangle, CircleDot, Clock, FileText, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { useLicenseAdverseMatterCase, type LicenseAdverseMatter } from '@/hooks/useLicenseLifecycle';

function stageTone(state: string) {
  if (state === 'done') return 'bg-emerald-500';
  if (state === 'current') return 'bg-primary';
  if (state === 'skipped') return 'bg-muted-foreground/40';
  return 'bg-muted';
}

function slaVariant(sla: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (sla === 'breached') return 'destructive';
  if (sla === 'due_soon') return 'default';
  return 'outline';
}

function MatterCard({ matter }: { matter: LicenseAdverseMatter }) {
  return (
    <div className="rounded-lg border" data-testid="license-adverse-matter">
      <div className="border-b px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{matter.matter_reference}</span>
          <Badge variant="outline" className="capitalize">{matter.matter_kind.replace(/_/g, ' ')}</Badge>
          <Badge variant={matter.status === 'open' ? 'default' : 'secondary'} className="capitalize">{matter.status}</Badge>
          <Badge variant="outline" className="capitalize">Stage: {matter.stage.replace(/_/g, ' ')}</Badge>
          {matter.sla_due_at && (
            <Badge variant={slaVariant(matter.sla_state)} className="gap-1">
              <Clock className="h-3 w-3" />
              {matter.sla_state.replace(/_/g, ' ')} · {formatDate(matter.sla_due_at)}
            </Badge>
          )}
        </div>
        <div className="grid gap-x-6 gap-y-1 text-xs md:grid-cols-3">
          <p><span className="text-muted-foreground">Source: </span>
            {matter.source_kind ? matter.source_kind.replace(/_/g, ' ') : 'Not recorded'}
            {matter.source_reference ? ` · ${matter.source_reference}` : ''}
          </p>
          <p><span className="text-muted-foreground">Owner: </span>{matter.owner_name ?? 'Unassigned'}{matter.team ? ` · ${matter.team}` : ''}</p>
          <p><span className="text-muted-foreground">Opened: </span>{formatDateTime(matter.opened_at)}</p>
          <p><span className="text-muted-foreground">Legal basis: </span>{matter.legal_basis ?? '—'}</p>
          <p><span className="text-muted-foreground">Waiting on: </span>{matter.waiting_on ?? '—'}</p>
          <p><span className="text-muted-foreground">Effective: </span>{matter.effective_date ? formatDate(matter.effective_date) : '—'}</p>
          {matter.related_matter_reference && (
            <p><span className="text-muted-foreground">Related matter: </span>{matter.related_matter_reference}</p>
          )}
          {matter.closed_at && (
            <p><span className="text-muted-foreground">Closed: </span>{formatDateTime(matter.closed_at)}</p>
          )}
        </div>
        {matter.reason && <p className="text-sm">{matter.reason}</p>}
        {matter.blockers.length > 0 && (
          <div className="space-y-1">
            {matter.blockers.map((b) => (
              <p key={b.key} className="text-xs flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-3 w-3" />{b.label}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Server-computed due-process timeline */}
      <div className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Due process</p>
        <ol className="space-y-2">
          {matter.timeline.map((ev) => (
            <li key={ev.key} className="flex gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${stageTone(ev.state)}`} />
              <div className="min-w-0">
                <p className={ev.state === 'pending' ? 'text-muted-foreground' : 'font-medium'}>
                  {ev.label}
                  {ev.state === 'current' && <Badge variant="outline" className="ml-2 text-[10px]">current</Badge>}
                  {ev.state === 'skipped' && <Badge variant="secondary" className="ml-2 text-[10px]">waived</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ev.at ? formatDateTime(ev.at) : 'Not yet reached'}
                  {ev.actor ? ` · ${ev.actor}` : ''}
                  {ev.detail ? ` · ${ev.detail}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {(matter.notices.length > 0 || matter.representations.length > 0 || matter.decisions.length > 0) && (
        <div className="grid gap-4 border-t px-4 py-3 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Notices ({matter.notices.length})
            </p>
            {matter.notices.map((n: any) => (
              <div key={n.id} className="text-xs mb-2">
                <p className="font-medium">{n.subject ?? n.notice_type}</p>
                <p className="text-muted-foreground">
                  Issued {n.issued_at ? formatDateTime(n.issued_at) : '—'}
                  {n.representation_deadline ? ` · representations by ${formatDate(n.representation_deadline)}` : ''}
                </p>
              </div>
            ))}
            {matter.notices.length === 0 && <p className="text-xs text-muted-foreground">None issued.</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <CircleDot className="h-3 w-3" /> Representations ({matter.representations.length})
            </p>
            {matter.representations.map((r: any) => (
              <div key={r.id} className="text-xs mb-2">
                <p className="font-medium capitalize">{(r.channel ?? 'submission').replace(/_/g, ' ')}</p>
                <p className="text-muted-foreground">
                  Received {r.received_at ? formatDateTime(r.received_at) : '—'}
                  {r.considered_at ? ` · considered ${formatDate(r.considered_at)}` : ''}
                </p>
              </div>
            ))}
            {matter.representations.length === 0 && <p className="text-xs text-muted-foreground">None received.</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Decisions ({matter.decisions.length})
            </p>
            {matter.decisions.map((d: any) => (
              <div key={d.id} className="text-xs mb-2">
                <p className="font-medium capitalize">{String(d.outcome ?? d.decision_type ?? '').replace(/_/g, ' ')}</p>
                <p className="text-muted-foreground">
                  {d.decided_at ? formatDateTime(d.decided_at) : '—'}
                  {d.appeal_deadline ? ` · appeal by ${formatDate(d.appeal_deadline)}` : ''}
                </p>
                {d.reason && <p className="text-muted-foreground">{d.reason}</p>}
              </div>
            ))}
            {matter.decisions.length === 0 && <p className="text-xs text-muted-foreground">No decision recorded.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function LicenseAdverseMatterPanel({ licenseId }: { licenseId: string }) {
  const { data, isLoading } = useLicenseAdverseMatterCase(licenseId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Adverse matters &amp; due process</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.matters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No suspension, revocation, reinstatement, surrender or expiry matter has been opened for this licence.
            Adverse action is started from Current step so that provenance, notice and representation rights are captured.
          </p>
        ) : (
          data.matters.map((m) => <MatterCard key={m.id} matter={m} />)
        )}
      </CardContent>
    </Card>
  );
}

export default LicenseAdverseMatterPanel;
