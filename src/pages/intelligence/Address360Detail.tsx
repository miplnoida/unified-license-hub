/**
 * F8A-B4 — Address 360 (`/intelligence/addresses/:addressId`).
 *
 * A thin, read-only view of ONE canonical address: its normalized key and
 * components, the effective-dated usages recorded against it (proposed,
 * approved/current and ended/historical) and the deterministic common-address
 * relationships derived from the same normalized key.
 *
 * Every read is served by the governed `address_360_overview` /
 * `address_common_matches` RPCs and the RLS-governed `address_usages` relation.
 * This screen performs no normalization, no matching and no table mutation; the
 * only writes available are the governed approve / end-usage RPCs.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  B4Empty, B4ErrorNotice, B4Loading, B4_INTELLIGENCE_CAVEAT,
} from '@/components/addresses/B4StateNotice';
import { formatAddress, usageState } from '@/components/addresses/SubjectAddressPanel';
import { useAddress360, type AddressOccupant } from '@/hooks/useAddressIntelligence';

function subjectHref(o: AddressOccupant): string | null {
  if (o.subject_kind === 'ENTITY') return `/entities/${o.subject_id}`;
  if (o.subject_kind === 'PERSON') return `/persons/${o.subject_id}`;
  return null;
}

export default function Address360Detail() {
  const { addressId } = useParams<{ addressId: string }>();
  const [asOfInput, setAsOfInput] = useState('');
  const { data, isLoading, error } = useAddress360(addressId, asOfInput || undefined);

  if (isLoading) {
    return <div className="p-6"><B4Loading label="Loading canonical address…" /></div>;
  }
  if (error || !data) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <PageHeader title="Address 360" description="Canonical address and co-location evidence" />
        <B4ErrorNotice error={error ?? new Error('ADDRESS_NOT_FOUND: no address payload returned')} />
      </div>
    );
  }

  const a = data.address;
  const occupants = data.occupants ?? [];
  const usages = occupants.filter((o) => o.match_class === 'EXACT');
  const normalizedOnly = occupants.filter((o) => o.match_class === 'NORMALIZED');
  const current = usages.filter((u) => u.approval_status === 'APPROVED' && !u.effective_to);
  const proposed = usages.filter((u) => u.approval_status === 'PROPOSED');
  const historical = usages.filter((u) => !!u.effective_to);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={formatAddress(a)}
        description="Canonical address — components, recorded usages and deterministic co-location evidence"
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="address-as-of" className="flex items-center gap-1 text-xs">
            <CalendarClock className="h-3 w-3" /> As at
          </Label>
          <Input
            id="address-as-of"
            type="date"
            className="w-44"
            value={asOfInput}
            onChange={(e) => setAsOfInput(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Effective view as at {data.as_of}. {data.scope_note}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" aria-hidden /> Canonical record
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Street line 1" value={a.street_line1} />
          <Field label="Street line 2" value={a.street_line2} />
          <Field label="Unit" value={a.unit} />
          <Field label="Locality" value={a.locality} />
          <Field label="Administrative area" value={a.admin_area} />
          <Field label="Postal code" value={a.postal_code} />
          <Field label="Country" value={a.country_code} />
          <Field label="Normalization version" value={String(a.normalization_version)} />
          <div className="md:col-span-2">
            <p className="text-xs text-muted-foreground">Normalized key (deterministic)</p>
            <p className="break-all font-mono text-xs">{a.normalized_key}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Approved current usages" value={current.length} />
        <Stat label="Proposed usages" value={proposed.length} />
        <Stat label="Historical usages" value={historical.length} />
        <Stat label="Co-located subjects" value={data.occupant_count} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recorded usages at this canonical address</CardTitle></CardHeader>
        <CardContent>
          {usages.length === 0 ? (
            <B4Empty
              title="No usage recorded at this address"
              body="This canonical address exists but no entity, person or establishment usage is recorded for the selected date."
            />
          ) : (
            <UsageTable rows={usages} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Common-address relationships</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.occupant_count <= 1 ? (
            <B4Empty
              title="No co-location evidence"
              body="Only one subject is recorded at this address (or at any address sharing its normalized key) for the selected date."
            />
          ) : (
            <>
              <Alert>
                <AlertTitle>Regulatory intelligence — interpretation required</AlertTitle>
                <AlertDescription>{B4_INTELLIGENCE_CAVEAT}</AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                EXACT = the same canonical address row. NORMALIZED = a distinct canonical row sharing
                this deterministic normalized key. No fuzzy or probabilistic matching is applied.
              </p>
              <UsageTable rows={occupants} showMatchClass />
              {normalizedOnly.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  All co-location on this record is EXACT (same canonical address row).
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTable({ rows, showMatchClass }: { rows: AddressOccupant[]; showMatchClass?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showMatchClass && <TableHead>Match</TableHead>}
          <TableHead>Subject</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Usage</TableHead>
          <TableHead>State</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => {
          const st = usageState(o);
          const href = subjectHref(o);
          return (
            <TableRow key={`${o.address_id}-${o.subject_kind}-${o.subject_id}-${o.usage_type}-${o.effective_from}`}>
              {showMatchClass && (
                <TableCell>
                  <Badge variant={o.match_class === 'EXACT' ? 'default' : 'secondary'}>{o.match_class}</Badge>
                </TableCell>
              )}
              <TableCell>
                {href ? (
                  <Link className="text-primary underline" to={href}>{o.subject_name ?? 'Unnamed subject'}</Link>
                ) : (o.subject_name ?? 'Unnamed subject')}
              </TableCell>
              <TableCell>{o.subject_kind}</TableCell>
              <TableCell>{o.usage_type}</TableCell>
              <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
              <TableCell>{o.effective_from}</TableCell>
              <TableCell>{o.effective_to ?? '—'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{o.source_kind}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value && value !== '' ? value : '—'}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
