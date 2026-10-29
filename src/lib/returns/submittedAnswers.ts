type V = { id: string; version_number: number; submitted_at: string | null };
type F = { return_filing_version_id: string; sequence: number };

/** Latest submitted version, else the latest version. */
export function pickDefaultAnswerVersion(versions: V[]): string | null {
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
  return (sorted.find((v) => !!v.submitted_at) ?? sorted[0])?.id ?? null;
}

export function formsForVersion<T extends F>(forms: T[], versionId: string): T[] {
  return forms.filter((f) => f.return_filing_version_id === versionId).sort((a, b) => a.sequence - b.sequence);
}
