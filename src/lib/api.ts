import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Standardized API response
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  count?: number;
}

// Standardized error handler
export function handleApiError(error: unknown, context?: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as any).message)
      : 'An unexpected error occurred';
  
  console.error(`[API Error${context ? ` - ${context}` : ''}]:`, message);
  return message;
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 300
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// Standardized paginated fetch
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export async function paginatedQuery<T>(
  table: string,
  params: PaginationParams = {},
  filters?: Record<string, unknown>
): Promise<ApiResponse<T[]> & { totalCount: number }> {
  const { page = 1, pageSize = 25, orderBy = 'created_at', ascending = false } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = (supabase.from(table as any).select('*', { count: 'exact' }) as any);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          query = query.eq(key, value);
        }
      }
    }

    const { data, error, count } = await query
      .order(orderBy, { ascending })
      .range(from, to);

    if (error) throw error;
    return { data: data as T[], error: null, totalCount: count || 0 };
  } catch (err) {
    return { data: null, error: handleApiError(err, `paginatedQuery(${table})`), totalCount: 0 };
  }
}

// Standardized mutation wrapper
export async function mutate<T>(
  operation: () => Promise<{ data: T | null; error: any }>
): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await operation();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    const message = handleApiError(err);
    toast.error(message);
    return { data: null, error: message };
  }
}

// Full-text search helper
export async function fullTextSearch<T>(
  table: string,
  searchColumn: string,
  query: string,
  options?: { limit?: number; filters?: Record<string, unknown> }
): Promise<ApiResponse<T[]>> {
  const { limit = 50, filters } = options || {};
  try {
    // Use Postgres textSearch via Supabase
    let q = (supabase.from(table as any).select('*') as any)
      .textSearch(searchColumn, query, { type: 'websearch', config: 'english' })
      .limit(limit);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          q = q.eq(key, value);
        }
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    return { data: data as T[], error: null };
  } catch (err) {
    return { data: null, error: handleApiError(err, `fullTextSearch(${table})`) };
  }
}
