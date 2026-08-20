/**
 * RDM-ENTITY-001 Wave B — Public onboarding: entity identification (`/register/entity`).
 *
 * Separates the two identities that used to be conflated:
 *   - the USER account (who is signing in), and
 *   - the regulated ENTITY the user is acting for.
 *
 * The user states who the entity is; the server resolves it:
 *   EXACT_MATCH   → reuse the existing canonical entity, request membership
 *   POSSIBLE_MATCH→ regulator-reviewed resolution case, no duplicate created
 *   NO_MATCH      → provision a provisional entity, membership requested
 */
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Info, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMembershipRoles } from '@/hooks/useEntityRegistry';
import { useOnboardingIdentity, type ResolveOutcome } from '@/hooks/useWaveB';
import { useIdentifierTypes, validateIdentifierValue } from '@/hooks/useIdentifierTypes';
import { useMintOnboardingToken } from '@/hooks/useOnboardingTokens';
import { readIntentFromSearch, persistIntent, loadPersistedIntent, clearPersistedIntent } from '@/lib/applicationIntent';

export default function EntityIdentification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { resolve, provision, requestMembership } = useOnboardingIdentity();
  const { data: roles = [] } = useMembershipRoles();
  const { data: identifierTypes = [] } = useIdentifierTypes();
  const mintToken = useMintOnboardingToken();
  // Resumable journey (§20): keep the intended application/form-package
  // context across the multi-page onboarding chain.
  const intent = readIntentFromSearch(location.search) || loadPersistedIntent();
  useEffect(() => { if (intent) persistIntent(intent); }, [intent]);
  const [pendingAuthority, setPendingAuthority] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [idType, setIdType] = useState('');
  const [idValue, setIdValue] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [evidence, setEvidence] = useState('');
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null);

  useEffect(() => {
    if (!idType && identifierTypes.length > 0) setIdType(identifierTypes[0].key);
  }, [identifierTypes, idType]);

  const primaryRole = roles.find((r) => r.is_primary_representative)?.key || roles[0]?.key || '';
  const effectiveRole = roleKey || primaryRole;

  if (loading) return <div className="py-20 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              Create your user account first. Entity identification links your account to the regulated entity you act for.
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate('/register')}>Create an account</Button>
            <Button variant="outline" onClick={() => navigate('/login?redirect=%2Fregister%2Fentity')}>Sign in</Button>
          </div>
        </main>
      </div>
    );
  }

  const doResolve = () => {
    if (!legalName.trim()) { toast.error('Enter the entity legal name'); return; }
    resolve.mutate(
      {
        legal_name: legalName.trim(),
        identifiers: idValue.trim() ? [{ type: idType, value: idValue.trim() }] : [],
        license_number: licenceNumber.trim() || null,
      },
      {
        onSuccess: (r) => setOutcome(r),
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  const linkMembership = (entityId: string) => {
    requestMembership.mutate(
      { entityId, roleKey: effectiveRole, evidenceRef: evidence || undefined },
      {
        onSuccess: () => {
          toast.success('Membership requested — a regulator officer will verify your authority to act.');
          navigate('/dashboard');
        },
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  const provisionNew = () => {
    provision.mutate(
      {
        legal_name: legalName.trim(),
        identifiers: idValue.trim() ? [{ type: idType, value: idValue.trim() }] : [],
        case_id: outcome?.case_id ?? null,
      },
      {
        onSuccess: (r) => linkMembership(r.entity_id),
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold">Identify the entity you act for</h1>
          <p className="text-sm text-muted-foreground">
            Your user account is separate from the regulated entity. Tell us which entity you represent and we will link
            your account to it — never creating a duplicate entity record.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Entity details</CardTitle>
            <CardDescription>Provide a registered identifier where you have one — names alone are never treated as proof of identity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Entity legal name</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As registered with the company registry" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Identifier type</Label>
                <Select value={idType} onValueChange={setIdType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_registration_number">Company registration number</SelectItem>
                    <SelectItem value="tax_identification_number">Tax identification number</SelectItem>
                    <SelectItem value="lei">Legal Entity Identifier (LEI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Identifier value</Label>
                <Input value={idValue} onChange={(e) => setIdValue(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Existing licence number (optional)</Label>
              <Input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} placeholder="Only used to look the entity up" />
            </div>
            <Button onClick={doResolve} disabled={resolve.isPending}>
              {resolve.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Identify entity
            </Button>
          </CardContent>
        </Card>

        {outcome && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Resolution outcome</CardTitle>
              <CardDescription>
                <Badge variant="outline" className="mr-2 text-xs">{outcome.outcome}</Badge>
                {outcome.outcome === 'EXACT_MATCH' && 'This entity already exists in the register — your account will be linked to it.'}
                {outcome.outcome === 'POSSIBLE_MATCH' && 'Possible existing entities found. A regulator officer decides before anything is created.'}
                {outcome.outcome === 'NO_MATCH' && 'No existing entity matched. A provisional entity record can be created for your application.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {outcome.candidates?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Candidate entities</p>
                  {outcome.candidates.map((c) => (
                    <div key={c.entity_id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <span>{c.legal_name}</span>
                      <span className="text-xs text-muted-foreground">score {c.match_score} · {c.match_basis}</span>
                    </div>
                  ))}
                </div>
              )}

              {outcome.outcome !== 'POSSIBLE_MATCH' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Your role at the entity</Label>
                    <Select value={effectiveRole} onValueChange={setRoleKey}>
                      <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Evidence of authority (reference)</Label>
                    <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Board resolution / authorisation letter reference" />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {outcome.outcome === 'EXACT_MATCH' && outcome.entity_id && (
                  <Button disabled={requestMembership.isPending || !effectiveRole} onClick={() => linkMembership(outcome.entity_id!)}>
                    {requestMembership.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Request access to this entity
                  </Button>
                )}
                {outcome.outcome === 'NO_MATCH' && (
                  <Button disabled={provision.isPending || requestMembership.isPending || !effectiveRole} onClick={provisionNew}>
                    {(provision.isPending || requestMembership.isPending) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Create provisional entity and request access
                  </Button>
                )}
                {outcome.outcome === 'POSSIBLE_MATCH' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Referred for review{outcome.case_number ? ` · ${outcome.case_number}` : ''}</AlertTitle>
                    <AlertDescription>
                      A regulator officer will confirm whether this is an existing entity. You will be notified once the
                      decision is recorded — no duplicate entity is created in the meantime.
                    </AlertDescription>
                  </Alert>
                )}
                <Button variant="outline" onClick={() => setOutcome(null)}>Change details</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
