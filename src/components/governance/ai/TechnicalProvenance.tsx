/**
 * Restricted technical provenance.
 *
 * The regulator/customer-facing governance screens show a vendor-neutral
 * identity. The true provider, gateway, technical model identifier and provider
 * model version are never deleted or rewritten — they are retained in the record
 * and shown here only to authorised technical administration and audit users.
 *
 * `available` is decided on the server. When it is false the values are not sent
 * to the browser at all, so this is an access control, not a visual one.
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, Lock, ShieldCheck } from 'lucide-react';

export interface ProvenanceField {
  label: string;
  value?: string | null;
  mono?: boolean;
}

export function TechnicalProvenance({
  available,
  fields,
  title = 'Restricted technical provenance',
}: {
  available: boolean;
  fields: ProvenanceField[];
  title?: string;
}) {
  if (!available) {
    return (
      <p className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Technical provenance — the underlying AI service, technical model identifier and provider model version — is
          retained in full for audit and forensic traceability, and is available to authorised technical
          administration and audit users only.
        </span>
      </p>
    );
  }

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          {title}
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Retained technical record. Restricted to authorised technical administration, audit, support and forensic
            traceability.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map((f) => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className={`mt-0.5 text-sm font-medium ${f.mono ? 'font-mono text-xs break-all' : ''}`}>
                  {f.value?.trim() ? f.value : 'Not recorded'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
