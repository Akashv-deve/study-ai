/**
 * Small LRU cache for file contents, bounded by entry count AND total characters so opening a few
 * very large files cannot grow memory without limit. Keys are `${projectId}:${fileId}`.
 */
export class FileContentCache {
  private readonly entries = new Map<string, string>();
  private chars = 0;

  constructor(private readonly maxEntries = 40, private readonly maxChars = 8_000_000) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (value.length > this.maxChars) return; // never let one file evict everything else
    const existing = this.entries.get(key);
    if (existing !== undefined) { this.chars -= existing.length; this.entries.delete(key); }
    this.entries.set(key, value);
    this.chars += value.length;
    for (const [oldest, text] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.chars <= this.maxChars) break;
      if (oldest === key) continue;
      this.entries.delete(oldest);
      this.chars -= text.length;
    }
  }

  clear(): void { this.entries.clear(); this.chars = 0; }
  get size(): number { return this.entries.size; }
}
