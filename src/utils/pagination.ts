export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationInfo {
  totalSize: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export const DEFAULT_LIMITS: Record<string, number> = {
  query: 200,
  aggregate: 200,
  search_objects: 50,
  list_analytics: 50,
  read_apex: 50,
  read_apex_trigger: 50,
  debug_logs: 10,
};

export function formatPaginationFooter(info: PaginationInfo): string {
  if (info.totalSize === 0 || info.returned === 0) return '';

  const start = info.offset + 1;
  const end = info.offset + info.returned;
  let footer = `\nShowing ${start}–${end} of ${info.totalSize} results.`;

  if (info.hasMore) {
    footer += ` Use offset: ${info.offset + info.limit} to see the next page.`;
  }

  return footer;
}

export function applyDefaults(
  params: PaginationParams,
  defaultLimit: number
): Required<PaginationParams> {
  return {
    limit: params.limit ?? defaultLimit,
    offset: params.offset ?? 0,
  };
}
