/**
 * Configurable CAMELS component ratings for a supervisory assessment
 * (PRU-ASS-001 §4.1–4.3).
 *
 * Components come from `prudential_assessment_components` (seeded with the six
 * CAMELS components, sector variants supported) — they are not hardcoded here.
 * Automated indicators are advisory only: an adjusted rating requires a
 * justification, and the original suggestion is preserved.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock } from 'lucide-react';
import {
  useAssessmentComponents,
  useComponentRatings,
  useUpsertComponentRating,
} from '@/hooks/usePrudentialPhase2';
import { isAssessmentFinal } from '@/lib/prudentialPhase2';

export const COMPONENT_RATINGS = [
  '1 - Strong',
  '2 - Satisfactory',
  '3 - Fair',
  '4 - Marginal',
  '5 - Unsatisfactory',
] as const;

interface Props {
  assessmentId: string;
  sectorId?: string | null;
  status?: string | null;
  /** Advisory rating per component code, derived from breaches/ratios. */
  suggestions?: Record<string, { rating: string; source: Record<string, any> }>;
}

export function CamelsComponentsPanel({ assessmentId, sectorId, status, suggestions = {} }: Props) {
  const { data: components = [], isLoading } = useAssessmentComponents(sectorId ?? null);
  const { data: ratings = [] } = useComponentRatings(assessmentId);
  const upsert = useUpsertComponentRating();
  const locked = isAssessmentFinal(status);

  const [draft, setDraft] = useState<Record<string, { rating: string; narrative: string; justification: string }>>({});

  useEffect(() => {
    const next: Record<string, { rating: string; narrative: string; justification: string }> = {};
    ratings.forEach((r) => {
      next[r.component_code] = {
        rating: r.rating ?? '',
        narrative: r.narrative ?? '',
        justification: r.override_justification ?? '',
      };
    });
    setDraft(next);
  }, [ratings]);

  const byCode = Object.fromEntries(ratings.map((r) => [r.component_code, r]));

  if (isLoading) {
    return <Card><CardContent className="pt-4 text-sm text-muted-foreground">Loading assessment components…</CardContent></Card>;
  }

  if (!components.length) {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          No assessment components are configured for this sector.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          CAMELS component ratings
          {locked && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Finalised — immutable</Badge>}
        </CardTitle>
        <CardDescription>
          Automated indicators are advisory. The supervisor owns each component rating; adjusting an
          advisory rating requires a justification and the original suggestion is retained.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {components.map((c) => {
          const saved = byCode[c.code];
          const suggestion = suggestions[c.code]?.rating ?? saved?.auto_suggested_rating ?? null;
          const value = draft[c.code] ?? { rating: '', narrative: '', justification: '' };
          const isOverride = !!suggestion && !!value.rating && value.rating !== suggestion;
          const needsJustification = isOverride && !value.justification.trim();

          const set = (patch: Partial<typeof value>) =>
            setDraft((d) => ({ ...d, [c.code]: { ...value, ...patch } }));

          return (
            <div key={c.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{c.code} — {c.label}</p>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </div>
                {suggestion && (
                  <Badge variant="outline" className="text-xs">Advisory: {suggestion}</Badge>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Rating</Label>
                  <Select
                    disabled={locked}
                    value={value.rating}
                    onValueChange={(v) => set({ rating: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                    <SelectContent>
                      {COMPONENT_RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Narrative</Label>
                  <Textarea
                    disabled={locked}
                    rows={2}
                    value={value.narrative}
                    onChange={(e) => set({ narrative: e.target.value })}
                  />
                </div>
              </div>

              {isOverride && (
                <div>
                  <Label className="text-xs text-destructive">
                    Adjustment justification (required — differs from the advisory rating)
                  </Label>
                  <Textarea
                    disabled={locked}
                    rows={2}
                    value={value.justification}
                    onChange={(e) => set({ justification: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  data-rbac="prudential_supervision.edit"
                  size="sm"
                  variant="outline"
                  disabled={locked || needsJustification || upsert.isPending}
                  onClick={() => upsert.mutate({
                    assessment_id: assessmentId,
                    component_id: c.id,
                    component_code: c.code,
                    rating: value.rating || null,
                    narrative: value.narrative || null,
                    override_justification: isOverride ? value.justification : null,
                    auto_suggested_rating: suggestion,
                    suggestion_source: suggestions[c.code]?.source ?? saved?.suggestion_source ?? {},
                  })}
                >
                  {upsert.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                    : 'Save component'}
                </Button>
                {saved?.updated_at && (
                  <span className="text-xs text-muted-foreground">
                    Last saved {new Date(saved.updated_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
