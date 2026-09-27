import { describe, it, expect, vi } from 'vitest';
import { createSseParser, SseFormatError } from '../sse';

describe('createSseParser — SSE robustness (partial frames, multi-frame reads, final buffered event)', () => {
  it('parses one event delivered across several network reads (a frame split mid-field)', () => {
    const payloads: unknown[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    parser.push('data: {"chu');
    parser.push('nk":"hel');
    parser.push('lo"}\n\n');
    expect(payloads).toEqual([{ chunk: 'hello' }]);
  });

  it('parses multiple complete events arriving in a single read', () => {
    const payloads: unknown[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    parser.push('data: {"chunk":"a"}\n\ndata: {"chunk":"b"}\n\ndata: {"chunk":"c"}\n\n');
    expect(payloads).toEqual([{ chunk: 'a' }, { chunk: 'b' }, { chunk: 'c' }]);
  });

  it('flush() processes a final event that never received its blank-line terminator (connection ended right after "done")', () => {
    const payloads: unknown[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    parser.push('data: {"chunk":"partial"}\n\ndata: {"done":true,"generationId":"g1","conversationId":"c1"}');
    expect(payloads).toEqual([{ chunk: 'partial' }]); // not yet, no terminator
    parser.flush();
    expect(payloads).toEqual([{ chunk: 'partial' }, { done: true, generationId: 'g1', conversationId: 'c1' }]);
  });

  it('never loses generationId/conversationId carried on the final event', () => {
    const payloads: any[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    parser.push('data: {"done":true,"generationId":"gen-42","conversationId":"conv-7"}\n\n');
    expect(payloads[0].generationId).toBe('gen-42');
    expect(payloads[0].conversationId).toBe('conv-7');
  });

  it('ignores comment/keepalive frames', () => {
    const onPayload = vi.fn();
    const parser = createSseParser(onPayload);
    parser.push(': keepalive\n\ndata: {"chunk":"x"}\n\n');
    expect(onPayload).toHaveBeenCalledTimes(1);
    expect(onPayload).toHaveBeenCalledWith({ chunk: 'x' });
  });

  it('a complete-but-corrupt frame throws SseFormatError (protocol error, distinct from a dropped connection)', () => {
    const parser = createSseParser(() => {});
    expect(() => parser.push('data: {not valid json\n\n')).toThrow(SseFormatError);
  });

  it('an incomplete trailing frame does NOT throw on push (only surfaced by the caller checking "did done ever arrive")', () => {
    const payloads: unknown[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    expect(() => parser.push('data: {"chunk":"cut off mid')).not.toThrow();
    expect(payloads).toEqual([]);
  });

  it('a truncated trailing frame is tolerated (not thrown) on flush, since a dropped connection is reported separately', () => {
    const parser = createSseParser(() => {});
    parser.push('data: {"chunk":"cut off mid');
    expect(() => parser.flush()).not.toThrow();
  });

  it('handles CRLF frame separators the same as LF', () => {
    const payloads: unknown[] = [];
    const parser = createSseParser((p) => payloads.push(p));
    parser.push('data: {"chunk":"a"}\r\n\r\ndata: {"chunk":"b"}\r\n\r\n');
    expect(payloads).toEqual([{ chunk: 'a' }, { chunk: 'b' }]);
  });
});
