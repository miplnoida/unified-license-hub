import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarClock, CheckCircle2, Circle, Gavel, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  AppealHearingFormat, LicenseAppeal, useAllLicenseAppealPanelMembers, useAppealCaseFile,
  useAppealPanelSnapshot, useLicenseAppealMutations, useLicenseAppealPanels,
} from '@/hooks/useLicenseAppeals';

import {
  HEARING_FORMAT_OPTIONS, decisionRuleLabel, hearingFormatLabel, isPanelInForce,
  panelMemberRoleLabel,
} from '@/lib/licenseAppeals';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import { AppealParticipationPanel } from '@/components/appeals/AppealParticipationPanel';

interface Props {
  appeal: LicenseAppeal;
}

/**
 * Panel referral, composition of record and hearing management for one appeal.
 *
 * The roster shown is the snapshot taken when the appeal was referred, so later
 * changes to the panel never rewrite history for this appeal.
 */
export function AppealPanelSection({ appeal }: Props) {
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAssignPrimary = useCan('license_appeals', 'assign_panel');
  const canAssignAlternate = useCan('license_appeals', 'decide');
  const canAssign = canAssignPrimary || canAssignAlternate;
  const { data: panels } = useLicenseAppealPanels(true);
  const { data: allMembers } = useAllLicenseAppealPanelMembers();

  const { data: snapshot } = useAppealPanelSnapshot(appeal.id);
  const { data: caseFile, isLoading: caseFileLoading } = useAppealCaseFile(appeal.id);
  const { assignPanel, scheduleHearing, completeHearing } = useLicenseAppealMutations();

  const [panelId, setPanelId] = useState('');
  const [hearingDate, setHearingDate] = useState('');
  const [format, setFormat] = useState<AppealHearingFormat>('written');
  const [venue, setVenue] = useState(appeal.hearing_venue || '');
  const [link, setLink] = useState(appeal.hearing_link || '');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(appeal.hearing_notes || '');
  const [amending, setAmending] = useState(false);

  const hearingCompleted = !!appeal.hearing_completed_at;


  const eligible = useMemo(
    () => (panels || []).filter(
      (p) => p.appeal_scope === 'licensing' && isPanelInForce(p)
        && (!p.regulator_id || !appeal.regulator_id || p.regulator_id === appeal.regulator_id),
    ),
    [panels, appeal.regulator_id],
  );

  /** A panel can only be constituted when it has a sitting chair and can meet quorum. */
  const readinessOf = (panel: { id: string; quorum: number }) => {
    const roster = (allMembers || []).filter((m) => m.panel_id === panel.id && m.is_active);
    const chair = roster.find((m) => m.is_chair);
    const voting = roster.filter((m) => m.is_voting).length;
    const problems: string[] = [];
    if (!chair) problems.push('no chair appointed');
    if (voting < panel.quorum) problems.push(`only ${voting} voting member(s) for a quorum of ${panel.quorum}`);
    return { ready: problems.length === 0, problems, voting, hasChair: !!chair };
  };
  const selectedPanel = eligible.find((p) => p.id === panelId);
  const selectedReadiness = selectedPanel ? readinessOf(selectedPanel) : null;


  const decided = appeal.status === 'decided';
  const caseFileReady = !!caseFile?.ready;
  const outstanding = (caseFile?.items || [])
    .filter((i) => i.required && !i.satisfied)
    .map((i) => i.label);

  const votingCount = (snapshot?.member_roster || []).filter((m) => m.is_voting).length;
  const quorumMet = snapshot ? votingCount >= snapshot.quorum : false;

  const refer = async () => {
    if (!panelId) { toast.error('Choose a panel'); return; }
    try {
      const res = await assignPanel.mutateAsync({
        appealId: appeal.id,
        panelId,
        hearingDate: hearingDate ? new Date(hearingDate).toISOString() : null,
        hearingFormat: format,
      });
      toast.success(`Appeal referred to the panel — ${res.members ?? 0} member(s) recorded`);
      setPanelId('');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to refer the appeal to a panel');
    }
  };

  const schedule = async () => {
    if (!hearingDate) { toast.error('Pick a hearing date and time'); return; }
    try {
      const res = await scheduleHearing.mutateAsync({
        appealId: appeal.id,
        hearingDate: new Date(hearingDate).toISOString(),
        hearingFormat: format,
        venue,
        link,
        reason,
      });
      toast.success(res.rescheduled ? 'Hearing rescheduled' : 'Hearing scheduled');
      setReason('');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to schedule the hearing');
    }
  };

  const complete = async () => {
    if (minutes.trim().length < 10) { toast.error('Record the hearing minutes first (at least 10 characters)'); return; }
    if (hearingCompleted && minutes.trim() === (appeal.hearing_notes || '').trim()) {
      toast.error('The minutes are unchanged — nothing to amend');
      return;
    }
    try {
      await completeHearing.mutateAsync({
        appealId: appeal.id,
        minutes: minutes.trim(),
        amend: hearingCompleted,
      });
      toast.success(hearingCompleted ? 'Hearing minutes amended' : 'Hearing marked complete');
      setAmending(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to complete the hearing');
    }
  };


  return (
    <div className="space-y-4">
      {/* Case file readiness */}
      {caseFile?.items && (
        <div className="rounded-md border p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            Appeal case file
            <Badge variant="outline" className={caseFile.ready
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-amber-100 text-amber-800 border-amber-200'}>
              {caseFile.ready ? 'Complete' : `${caseFile.blocking_count} item(s) outstanding`}
            </Badge>
          </p>
          <ul className="space-y-1 text-sm">
            {caseFile.items.map((i) => (
              <li key={i.key} className="flex items-center gap-2">
                {i.satisfied
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={i.satisfied ? '' : 'text-muted-foreground'}>{i.label}</span>
                {!i.required && <span className="text-xs text-muted-foreground">(optional)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Composition of record */}
      {snapshot ? (
        <div className="rounded-md border p-3">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            {snapshot.panel_name}
            <Badge variant="outline" className={quorumMet
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-rose-100 text-rose-800 border-rose-200'}>
              {quorumMet ? 'Quorum met' : 'Quorum not met'}
            </Badge>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Composition recorded {formatDateTime(snapshot.snapshot_at)} · quorum {snapshot.quorum} ·{' '}
            {decisionRuleLabel(snapshot.decision_rule)} · {hearingFormatLabel(snapshot.hearing_format)}
          </p>
          <ul className="space-y-2 text-sm">
            {(snapshot.member_roster || []).map((m) => (
              <li key={m.member_id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.full_name}</span>
                {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
                <span className="text-xs text-muted-foreground">{panelMemberRoleLabel(m.member_role)}</span>
                {m.is_chair && <Badge variant="outline">Chair</Badge>}
                {!m.is_voting && <span className="text-xs text-muted-foreground">non-voting</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No panel has been constituted for this appeal yet.
        </div>
      )}

      {/* Referral */}
      {!snapshot && canAssign && !decided && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Gavel className="h-4 w-4" /> Refer to a panel</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Eligible panel</Label>
              <Select value={panelId} onValueChange={setPanelId}>
                <SelectTrigger><SelectValue placeholder="Select a panel in force" /></SelectTrigger>
                <SelectContent>
                  {eligible.map((p) => {
                    const r = readinessOf(p);
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={!r.ready}>
                        {p.name} — quorum {p.quorum}
                        {r.ready ? '' : ` · ${r.problems.join('; ')}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {eligible.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No licensing appeal panel is in force for this regulator.
                </p>
              )}
              {eligible.length > 0 && !eligible.some((p) => readinessOf(p).ready) && (
                <p className="mt-1 text-xs text-amber-700">
                  No panel can be constituted yet — appoint a chair and enough voting members in
                  Admin → Appeal Panels → Composition.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Hearing date &amp; time (optional)</Label>
              <Input type="datetime-local" value={hearingDate} onChange={(e) => setHearingDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hearing format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as AppealHearingFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEARING_FORMAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <GuardedButton module="license_appeals" action="edit" data-rbac="license_appeals.edit"
            size="sm"
            onClick={refer}
            disabled={
              assignPanel.isPending || caseFileLoading || !caseFileReady
              || (!!selectedReadiness && !selectedReadiness.ready)
            }
          >
            {(assignPanel.isPending || caseFileLoading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refer &amp; constitute panel
          </GuardedButton>
          {caseFileLoading ? (
            <p className="text-xs text-muted-foreground">Checking the appeal case file…</p>
          ) : !caseFileReady ? (
            <p className="text-xs text-muted-foreground">
              {outstanding.length > 0
                ? `Outstanding before referral: ${outstanding.join(', ')}.`
                : 'The case file must be complete before the appeal can go to a panel.'}
            </p>
          ) : selectedReadiness && !selectedReadiness.ready ? (
            <p className="text-xs text-amber-700">
              That panel cannot sit: {selectedReadiness.problems.join('; ')}. Fix it in
              Admin → Appeal Panels → Composition.
            </p>
          ) : null}


        </div>
      )}

      {/* Hearing management */}
      {snapshot && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" /> Hearing
            {appeal.hearing_completed_at && (
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                Completed {formatDateTime(appeal.hearing_completed_at)}
              </Badge>
            )}
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Scheduled for</p><p>{appeal.hearing_date ? formatDateTime(appeal.hearing_date) : 'Not scheduled'}</p></div>
            <div><p className="text-xs text-muted-foreground">Format</p><p>{hearingFormatLabel(appeal.hearing_format)}</p></div>
            {appeal.hearing_venue && <div><p className="text-xs text-muted-foreground">Venue</p><p>{appeal.hearing_venue}</p></div>}
            {appeal.hearing_link && (
              <div>
                <p className="text-xs text-muted-foreground">Joining link</p>
                <a href={appeal.hearing_link} target="_blank" rel="noreferrer" className="text-primary underline break-all">
                  {appeal.hearing_link}
                </a>
              </div>
            )}
          </div>

          {canAssign && !decided && (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Date &amp; time</Label>
                  <Input type="datetime-local" value={hearingDate} onChange={(e) => setHearingDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as AppealHearingFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HEARING_FORMAT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Venue</Label>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Hearing room / address" />
                </div>
                <div>
                  <Label className="text-xs">Virtual joining link</Label>
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
                </div>
                {appeal.hearing_date && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Reason for rescheduling / adjournment</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Adjourned at the appellant's request" />
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={schedule} disabled={scheduleHearing.isPending}>
                {scheduleHearing.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {appeal.hearing_date ? 'Reschedule hearing' : 'Schedule hearing'}
              </Button>

              {hearingCompleted && !amending ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Hearing minutes · recorded {formatDateTime(appeal.hearing_completed_at)}
                  </p>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">
                    {appeal.hearing_notes || 'No minutes recorded'}
                  </p>
                  <Button data-rbac="license_appeals.edit"
                    size="sm"
                    variant="outline"
                    onClick={() => { setMinutes(appeal.hearing_notes || ''); setAmending(true); }}
                  >
                    Amend minutes
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Hearing notes / minutes</Label>
                    <Textarea rows={3} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Attendance, submissions made, adjournments, next steps…" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={complete}
                      disabled={
                        completeHearing.isPending
                        || !appeal.hearing_date
                        || minutes.trim().length < 10
                        || (hearingCompleted && minutes.trim() === (appeal.hearing_notes || '').trim())
                      }
                    >
                      {completeHearing.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {hearingCompleted ? 'Save amended minutes' : 'Save minutes & mark hearing complete'}
                    </Button>
                    {hearingCompleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={completeHearing.isPending}
                        onClick={() => { setAmending(false); setMinutes(appeal.hearing_notes || ''); }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </>
              )}

            </>
          )}

          {appeal.hearing_notes && (!canAssign || decided) && (
            <div>
              <p className="text-xs text-muted-foreground">Hearing minutes</p>
              <p className="whitespace-pre-wrap text-sm">{appeal.hearing_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Participation, conflict/recusal, voting and quorum — backend authoritative */}
      <AppealParticipationPanel appealId={appeal.id} />
    </div>
  );
}
