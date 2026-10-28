/** Exhaustive breakdown of the visible records, including new/unknown statuses. */
export function reportStatusCounts(records: Array<{ status: string | null }>) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const status = record.status || 'unclassified';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return {
    total: records.length,
    rows: [...counts].sort(([a], [b]) => a.localeCompare(b))
      .map(([status, count]) => ({ status, count })),
  };
}