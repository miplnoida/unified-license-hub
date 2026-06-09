import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReportSchedule, deleteReportSchedule, getReportSchedules, updateReportSchedule,
} from '../services/reportService';

const KEY = ['reports', 'schedules'] as const;

export function useReportSchedules() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: getReportSchedules, staleTime: 30_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const create = useMutation({ mutationFn: createReportSchedule, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateReportSchedule>[1] }) => updateReportSchedule(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteReportSchedule, onSuccess: invalidate });
  return { ...query, create, update, remove };
}
