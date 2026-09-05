/**
 * Engagement type of an examination, for engagement-aware wording only.
 *
 * Reads the same canonical examination record the workspace already loads, so
 * no panel is forked and no extra business logic is introduced: an offsite
 * review uses exactly the same scope, team, requests, workpapers, evidence,
 * findings and stage lifecycle as an onsite examination.
 */
import { useExamination } from '@/hooks/useExaminations';

export function useExaminationEngagement(examinationId?: string) {
  const { data } = useExamination(examinationId);
  return (data?.engagement_type as string | null | undefined) ?? (data?.examination_type as string | null) ?? null;
}
