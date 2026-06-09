import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteReportRun, getReportHistory } from '../services/reportService';

const KEY = ['reports', 'history'] as const;

export function useReports() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: getReportHistory, staleTime: 30_000 });
  const remove = useMutation({
    mutationFn: deleteReportRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { ...query, remove, invalidate: () => qc.invalidateQueries({ queryKey: KEY }) };
}
