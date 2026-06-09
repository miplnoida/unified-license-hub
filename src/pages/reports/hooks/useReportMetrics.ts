import { useQuery } from '@tanstack/react-query';
import { getReportMetrics } from '../services/reportService';

export function useReportMetrics() {
  return useQuery({
    queryKey: ['reports', 'metrics'],
    queryFn: getReportMetrics,
    staleTime: 60_000,
  });
}
