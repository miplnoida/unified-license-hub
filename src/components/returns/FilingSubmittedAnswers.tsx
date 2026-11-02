/**
 * Regulator read-only view of the answers stored for one filing version.
 * Renders each pinned form version against its stored response with the
 * standard form renderer in read-only mode (sections, repeatable tables and
 * attachments). Reads only; access is decided server-side by RLS.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EntityFilingForm } from '@/components/entity/returns-canonical/EntityFilingForm';
import type { FilingDetail } from '@/hooks/useWaveC';
import { pickDefaultAnswerVersion, formsForVersion } from '@/lib/returns/submittedAnswers';

export function FilingSubmittedAnswers({ versions, forms }: {
  versions: FilingDetail['versions'];
  forms: FilingDetail['forms'];
}) {
  const sorted = useMemo(() => [...versions].sort((a, b) => b.version_number - a.version_number), [versions]);
  const [versionId, setVersionId] = useState<string>(() => pickDefaultAnswerVersion(versions) ?? '');
  const selected = sorted.find((v) => v.id === versionId) ?? null;
  const versionForms = formsForVersion(forms, versionId);

  if (sorted.length === 0 || !sorted.some((v) => !!v.submitted_at)) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">This filing has not been submitted yet – no answers to review.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Filing version</span>
        <Select value={versionId} onValueChange={setVersionId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select version" /></SelectTrigger>
          <SelectContent>
            {sorted.map((v) => (
              <SelectItem key={v.id} value={v.id}>v{v.version_number} — {v.status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && !selected.submitted_at && (
          <span className="text-xs text-muted-foreground">This version has not been submitted yet.</span>
        )}
      </div>
      {versionForms.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No forms attached to this version.</CardContent></Card>
      ) : versionForms.map((f) => (
        f.form_response_id ? (
          <EntityFilingForm key={f.id} requirement={f} editable={false} />
        ) : (
          <Card key={f.id}><CardContent className="p-6 text-sm text-muted-foreground">
            {f.template_name ?? 'Form'} — no answers stored for this form.
          </CardContent></Card>
        )
      ))}
    </div>
  );
}
