export interface ResponseSelection { code?: string; startLine?: number; endLine?: number }

/**
 * One canonical key for retrieval and ordinary-response replacement. The action
 * type is deliberately not part of the key: a follow-up replaces its source
 * context rather than creating a second active response for the same code.
 */
export function responseContextKey(type: string, filePath?: string, selection?: ResponseSelection): string {
  if (type === 'overview') return 'project-overview';
  if (!filePath) return 'project';
  return selection?.code ? `${filePath}:${selection.startLine ?? 0}-${selection.endLine ?? 0}` : filePath;
}
