/**
 * F8A-B4 — explicit state rendering for every address / intelligence surface.
 *
 * A B4 screen must never collapse authorization failures, unresolved identity
 * or a missing runtime contract into "no records found". This component maps a
 * classified `B4Failure` to a distinct, honest message.
 */
import { AlertTriangle, DatabaseZap, Inbox, Loader2, Lock, MapPinOff, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { classifyB4Error, type B4FailureKind } from '@/hooks/useAddressIntelligence';

const COPY: Record<B4FailureKind, { title: string; body: string; variant: 'default' | 'destructive' }> = {
  UNAUTHORIZED: {
    title: 'You do not have permission to view this',
    body: 'Address and co-location intelligence requires the entity structure view permission. '
      + 'This is a permission outcome, not an empty record set.',
    variant: 'default',
  },
  OUT_OF_SCOPE: {
    title: 'Outside your supervisory scope',
    body: 'This subject belongs to a regulatory scope you are not assigned to, so its address '
      + 'evidence is withheld.',
    variant: 'default',
  },
  NOT_FOUND: {
    title: 'Record not found',
    body: 'The canonical address or usage referenced by this link no longer exists.',
    variant: 'default',
  },
  CONTRACT_MISSING: {
    title: 'Required backend contract is missing',
    body: 'A required function, table or column of the address contract is not present in this '
      + 'environment. This is a deployment defect, not an empty result.',
    variant: 'destructive',
  },
  INVALID_INPUT: {
    title: 'Search input rejected',
    body: 'The server rejected this request as incomplete or too broad. Refine the input and retry.',
    variant: 'default',
  },
  BACKEND_ERROR: {
    title: 'Backend request failed',
    body: 'The governed address request returned an error and no evidence could be read.',
    variant: 'destructive',
  },
};

export function B4ErrorNotice({ error }: { error: unknown }) {
  const failure = classifyB4Error(error);
  const copy = COPY[failure.kind];
  const Icon = failure.kind === 'UNAUTHORIZED' ? Lock
    : failure.kind === 'OUT_OF_SCOPE' ? ShieldAlert
      : failure.kind === 'CONTRACT_MISSING' ? DatabaseZap
        : AlertTriangle;
  return (
    <Alert variant={copy.variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.body}</p>
        <p className="mt-1 font-mono text-xs opacity-80">{failure.kind}: {failure.message}</p>
      </AlertDescription>
    </Alert>
  );
}

export function B4Loading({ label = 'Loading address evidence…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/** Valid empty state — genuinely no records, and said so plainly. */
export function B4Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <Inbox className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p>{body}</p>
      </div>
    </div>
  );
}

/** Unresolved identity — a source record exists but cannot be safely attributed. */
export function B4Unresolved({ body }: { body: string }) {
  return (
    <Alert>
      <MapPinOff className="h-4 w-4" />
      <AlertTitle>Source evidence exists but is not attributable</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

export const B4_INTELLIGENCE_CAVEAT =
  'Shared-address results are deterministic regulatory intelligence leads only. A common address '
  + 'is not evidence of beneficial ownership, control, household membership, related-party status '
  + 'or misconduct, and requires supervisory interpretation before any action.';
