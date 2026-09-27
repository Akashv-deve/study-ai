import { describe, it, expect } from 'vitest';
import { FileContentCache } from '../fileContentCache';

describe('FileContentCache — file switching (revisit a file without refetching)', () => {
  it('returns a previously set value without needing another fetch', () => {
    const cache = new FileContentCache();
    cache.set('p1:f1', 'const a = 1;');
    expect(cache.get('p1:f1')).toBe('const a = 1;');
  });

  it('a cache miss is undefined, so the caller knows to fetch and show a loading state', () => {
    const cache = new FileContentCache();
    expect(cache.get('p1:unknown')).toBeUndefined();
  });

  it('evicts the least-recently-used entry once maxEntries is exceeded', () => {
    const cache = new FileContentCache(2, 1_000_000);
    cache.set('a', 'A'); cache.set('b', 'B'); cache.set('c', 'C');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('B');
    expect(cache.get('c')).toBe('C');
    expect(cache.size).toBe(2);
  });

  it('get() refreshes recency, so a just-revisited file survives eviction over one that was not', () => {
    const cache = new FileContentCache(2, 1_000_000);
    cache.set('a', 'A'); cache.set('b', 'B');
    cache.get('a'); // touch a -> b is now the least-recently-used
    cache.set('c', 'C');
    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
  });

  it('evicts by total character budget as well as entry count (one huge file cannot blow up memory)', () => {
    const cache = new FileContentCache(40, 100);
    cache.set('small', 'x'.repeat(60));
    cache.set('big', 'y'.repeat(60));
    expect(cache.get('small')).toBeUndefined();
    expect(cache.get('big')).toBe('y'.repeat(60));
  });

  it('refuses to store a single file larger than the whole budget (never evicts everything else for it)', () => {
    const cache = new FileContentCache(40, 100);
    cache.set('normal', 'n'.repeat(50));
    cache.set('huge', 'h'.repeat(200));
    expect(cache.get('huge')).toBeUndefined();
    expect(cache.get('normal')).toBe('n'.repeat(50));
  });

  it('clear() empties the cache', () => {
    const cache = new FileContentCache();
    cache.set('a', 'A');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
