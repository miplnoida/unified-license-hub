/**
 * F8A-B3 — canonical Person 360 (`/persons/:partyId`).
 *
 * A single internal view of one canonical natural person: governed appointments,
 * ownership and control interests, linked Fit & Proper contexts and governed
 * relationships. Every figure is served by `person_360_overview` /
 * `person_relationship_network`; this page performs no matching, aggregation or
 * eligibility logic of its own and never displays date of birth, national ID or
 * passport details.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, Loader2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScreenHelpLink } from '@/components/help/ScreenHelpLink';
import { PersonAddressIntelligencePanel } from '@/components/addresses/PersonAddressIntelligencePanel';
import { usePerson360, usePersonNetworkAsOf, type PersonNetwork } from '@/hooks/usePerson360';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function dash(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function pct(value: number | null) {
  return value === null || value === undefined ? '—' : `${Number(value)}%`;
}

export default function Person360Detail() {
  const { partyId } = useParams<{ partyId: string }>();
  const [asOfInput, setAsOfInput] = useState('');
  const current = usePerson360(partyId);
  const historic = usePersonNetworkAsOf(partyId, asOfInput || undefined);

  const isLoading = current.isLoading || (!!asOfInput && historic.isLoading);
  const error = current.error ?? (asOfInput ? historic.error : null);
  const data: PersonNetwork | undefined = (asOfInput ? historic.data : current.data) ?? undefined;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading person profile…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Person profile unavailable</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'This canonical person could not be read.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={data.identity.display_name}
        description="Canonical natural person — appointments, ownership, Fit & Proper contexts and relationships"
        actions={<ScreenHelpLink surface="ownership-ubo" />}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="person-as-of" className="flex items-center gap-1 text-xs">
            <CalendarClock className="h-3 w-3" /> As at
          </Label>
          <Input
            id="person-as-of"
            type="date"
            className="w-44"
            value={asOfInput}
            onChange={(e) => setAsOfInput(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Source of record: {data.identity.source_authority}. Effective view as at {dash(data.as_of)}.
        </p>
      </div>

      {data.restricted_branches > 0 && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Some relationships are outside your supervisory scope</AlertTitle>
          <AlertDescription>
            {data.restricted_branches} record(s) are withheld ({dash(data.restricted_reason)}).
          </AlertDescription>
        </Alert>
      )}

      {!!data.conflicts && data.conflicts > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Identity conflict detected</AlertTitle>
          <AlertDescription>
            {data.conflicts} appointment(s) name a different canonical person than the linked
            Fit &amp; Proper record. Resolve this in the identity resolution queue.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Current appointments" value={data.counts.appointments_current} />
        <Stat label="Entities" value={data.counts.entities_with_appointments} />
        <Stat label="Current interests" value={data.counts.ownership_current} />
        <Stat label="Fit & Proper contexts" value={data.fp_contexts_visible ? data.counts.fp_contexts : '—'} />
      </div>

      <Card>
        <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
        <CardContent>
          {data.appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments recorded for this view.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.appointments.map((a) => (
                  <TableRow key={a.appointment_id}>
                    <TableCell>
                      <Link className="text-primary underline" to={`/entities/${a.entity_id}`}>
                        {dash(a.entity_name)}
                      </Link>
                    </TableCell>
                    <TableCell>{dash(a.role)}{a.is_executive ? ' (executive)' : ''}</TableCell>
                    <TableCell>{dash(a.regulatory_approval_status)}</TableCell>
                    <TableCell>{dash(a.effective_from)?.slice(0, 10)}</TableCell>
                    <TableCell>{a.effective_to ? String(a.effective_to).slice(0, 10) : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={a.is_current ? 'default' : 'secondary'}>
                        {a.is_current ? 'Current' : dash(a.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ownership &amp; control</CardTitle></CardHeader>
        <CardContent>
          {data.ownership.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ownership interests recorded for this view.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Held in</TableHead>
                  <TableHead>Economic</TableHead>
                  <TableHead>Voting</TableHead>
                  <TableHead>Controller</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ownership.map((o) => (
                  <TableRow key={o.interest_id}>
                    <TableCell>
                      {o.owned_entity_id ? (
                        <Link className="text-primary underline" to={`/entities/${o.owned_entity_id}`}>
                          {dash(o.owned_entity_name ?? o.owned_party_name)}
                        </Link>
                      ) : dash(o.owned_party_name)}
                    </TableCell>
                    <TableCell>{pct(o.economic_interest_percentage)}</TableCell>
                    <TableCell>{pct(o.voting_rights_percentage)}</TableCell>
                    <TableCell>{o.is_controller ? dash(o.control_determination ?? 'Yes') : 'No'}</TableCell>
                    <TableCell>{dash(o.approval_status)}</TableCell>
                    <TableCell>{dash(o.effective_from)?.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fit &amp; Proper contexts</CardTitle></CardHeader>
        <CardContent>
          {!data.fp_contexts_visible ? (
            <p className="text-sm text-muted-foreground">
              You do not have permission to view Fit &amp; Proper information.
            </p>
          ) : data.fp_contexts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Fit &amp; Proper record is linked to this canonical person.
            </p>
          ) : (
            <div className="space-y-4">
              {data.fp_contexts.map((c) => (
                <div key={c.fp_individual_id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.full_name}</span>
                    <Badge variant="secondary">{dash(c.status)}</Badge>
                    <Badge variant="outline">Link: {dash(c.link_method)}</Badge>
                    {c.link_category && <Badge variant="outline">{c.link_category}</Badge>}
                  </div>
                  {c.roles.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {c.roles.map((r) => (
                        <li key={r.role_id}>
                          {dash(r.role_title ?? r.role_type)} —{' '}
                          {r.is_current ? 'current' : 'historic'}
                          {r.effective_from ? ` from ${String(r.effective_from).slice(0, 10)}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* F8A-B4 — canonical address usage and deterministic co-location evidence.
          Person 360 stays a projection: this section performs no address or
          identity mutation. */}
      {partyId && <PersonAddressIntelligencePanel partyId={partyId} asOf={asOfInput || undefined} />}

      <Card>
        <CardHeader><CardTitle>Relationships</CardTitle></CardHeader>
        <CardContent>
          {data.relationships.length === 0 ? (
            <p className="text-sm text-muted-foreground">No governed relationships recorded for this view.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.relationships.map((r) => (
                  <TableRow key={r.relationship_id}>
                    <TableCell>{dash(r.counterparty_name)}</TableCell>
                    <TableCell>{dash(r.relationship_type)}</TableCell>
                    <TableCell>{r.direction}</TableCell>
                    <TableCell>{dash(r.effective_from)?.slice(0, 10)}</TableCell>
                    <TableCell>{r.is_current ? 'Current' : dash(r.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
