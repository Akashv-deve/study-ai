export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
