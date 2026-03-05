import type { InquiryFilters } from '@/types';

/**
 * Parse URL search params into inquiry filters + page.
 * Used so listing pages can restore filter state when user returns from detail (e.g. back button).
 */
export function parseInquiryFiltersFromParams(
  searchParams: URLSearchParams
): Partial<InquiryFilters> & { page?: number } {
  const get = (k: string) => searchParams.get(k) ?? undefined;
  const pageStr = searchParams.get('page');
  const page = pageStr ? Math.max(1, parseInt(pageStr, 10) || 1) : 1;
  const assignedTo = get('assignedTo');
  const createdBy = get('createdBy');
  return {
    search: get('search') || undefined,
    status: (get('status') as InquiryFilters['status']) || undefined,
    course: (get('course') as InquiryFilters['course']) || undefined,
    location: (get('location') as InquiryFilters['location']) || undefined,
    medium: (get('medium') as InquiryFilters['medium']) || undefined,
    dateFrom: get('dateFrom') || undefined,
    dateTo: get('dateTo') || undefined,
    dateRange: get('dateRange') || undefined,
    sort: get('sort') || undefined,
    order: (get('order') as 'asc' | 'desc') || undefined,
    assignedTo: assignedTo || undefined,
    createdBy: createdBy || undefined,
    page,
  };
}

/**
 * Build URL search params object from inquiry filters + page (and optional extras).
 * Omit keys that are undefined/empty so URL stays clean.
 */
export function inquiryFiltersToParams(
  filters: Partial<InquiryFilters>,
  page?: number,
  extras?: Record<string, string | undefined>
): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.status) params.status = filters.status;
  if (filters.course) params.course = filters.course;
  if (filters.location) params.location = filters.location;
  if (filters.medium) params.medium = filters.medium;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.dateRange) params.dateRange = filters.dateRange;
  if (filters.sort) params.sort = filters.sort;
  if (filters.order) params.order = filters.order;
  const at = filters.assignedTo;
  if (at != null) params.assignedTo = Array.isArray(at) ? at[0] ?? '' : String(at);
  if (filters.createdBy) params.createdBy = filters.createdBy;
  if (page != null && page > 1) params.page = String(page);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v != null && v !== '') params[k] = v;
    }
  }
  return params;
}

export function paramsToSearchString(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}
