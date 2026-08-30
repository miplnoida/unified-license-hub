/**
 * F8A-B4 — Person 360 address & address-intelligence section.
 *
 * Person 360 remains a PROJECTION: this panel reads the governed
 * `person_address_intelligence` RPC for the effective view and the shared
 * canonical address panel for full usage history. It never writes to
 * `addresses` / `address_usages` directly, never fabricates an identity link and
 * never silently resolves an ambiguous Fit & Proper identity — unresolved
 * identities keep their B3 behaviour and surface in the governed queues.
 */
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  B4Empty, B4ErrorNotice, B4Loading, B4_INTELLIGENCE_CAVEAT,
} from './B4StateNotice';
import { SubjectAddressPanel, usageState } from './SubjectAddressPanel';
import { usePersonAddressIntelligence } from '@/hooks/useAddressIntelligence';

export function PersonAddressIntelligencePanel({
  partyId, asOf,
}: { partyId: string; asOf?: string }) {
  const { data, isLoading, error } = usePersonAddressIntelligence(partyId, asOf);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Address intelligence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <B4Loading />
          ) : error ? (
            <B4ErrorNotice error={error} />
          ) : (data?.addresses ?? []).length === 0 ? (
            <B4Empty
              title="No address usage effective for this view"
              body="No canonical address usage is effective for this person at the selected date. Historical usages, if any, are listed below."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Co-located subjects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.addresses ?? []).map((u) => {
                    const st = usageState(u);
                    return (
                      <TableRow key={u.usage_id}>
                        <TableCell>
                          <Link className="text-primary underline" to={`/intelligence/addresses/${u.address_id}`}>
                            {u.address_line}
                          </Link>
                        </TableCell>
                        <TableCell>{u.usage_type}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell>{u.effective_from}</TableCell>
                        <TableCell>{u.effective_to ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.source_kind}</TableCell>
                        <TableCell>{u.co_occupants}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">{B4_INTELLIGENCE_CAVEAT}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Same canonical primitive as the entity profile — full usage history. */}
      <SubjectAddressPanel
        subjectKind="PERSON"
        subjectId={partyId}
        title="Recorded address usages (all dates)"
      />
    </div>
  );
}

export default PersonAddressIntelligencePanel;
