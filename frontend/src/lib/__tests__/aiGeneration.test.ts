import { describe, it, expect } from 'vitest';
import { generationReducer, initialGenerationState, httpFailure, contextKeyFor, isBusy, type GenerationState } from '../aiGeneration';

const req = (over: Partial<{ prompt: string; type: string; filePath: string }> = {}) => ({ prompt: 'Explain this', type: 'file_explanation', ...over });

describe('generationReducer — race safety (file switching / duplicate-generation prevention)', () => {
  it('start always resets to a clean connecting state, discarding the previous response identity', () => {
    const prior: GenerationState = { status: 'completed', runId: 3, content: 'old answer', generationId: 'g-old', isFavorite: true };
    const next = generationReducer(prior, { type: 'start', runId: 4, request: req() });
    expect(next).toMatchObject({ status: 'connecting', runId: 4, content: '' });
    expect(next.generationId).toBeUndefined();
    expect(next.isFavorite).toBeUndefined();
  });

  it('a chunk from a stale (superseded) run is ignored — this is what makes a double-click / rapid re-click safe', () => {
    const state = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req() });
    // Simulate a second click superseding the first before its first chunk arrives.
    const state2 = generationReducer(state, { type: 'start', runId: 2, request: req() });
    const clobbered = generationReducer(state2, { type: 'chunk', runId: 1, text: 'from the stale request' });
    expect(clobbered).toBe(state2); // untouched: stale runId is a no-op
    const legit = generationReducer(state2, { type: 'chunk', runId: 2, text: 'from the live request' });
    expect(legit.content).toBe('from the live request');
  });

  it('done/fail/cancel from a stale run are all no-ops (not just chunk)', () => {
    const live = generationReducer(initialGenerationState, { type: 'start', runId: 5, request: req() });
    expect(generationReducer(live, { type: 'done', runId: 4, generationId: 'g' })).toBe(live);
    expect(generationReducer(live, { type: 'fail', runId: 4, error: { code: 'AI_INTERNAL', message: 'x', retryable: true } })).toBe(live);
    expect(generationReducer(live, { type: 'cancel', runId: 4 })).toBe(live);
  });

  it('done/fail/cancel are no-ops once the run is no longer busy (already completed/failed)', () => {
    const done = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req() });
    const completed = generationReducer(done, { type: 'done', runId: 1, generationId: 'g1' });
    expect(generationReducer(completed, { type: 'chunk', runId: 1, text: 'late' })).toBe(completed);
  });
});

describe('generationReducer — partial-response behaviour', () => {
  it('a failure preserves whatever content streamed in before the connection broke, and is not presented as complete', () => {
    let state = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req() });
    state = generationReducer(state, { type: 'chunk', runId: 1, text: 'partial answer so far' });
    state = generationReducer(state, { type: 'fail', runId: 1, error: { code: 'AI_CONNECTION', message: 'Connection interrupted', retryable: true } });
    expect(state.status).toBe('failed');
    expect(state.content).toBe('partial answer so far'); // never replaced with a generic "unable to generate"
    expect(state.error?.code).toBe('AI_CONNECTION');
  });
});

describe('generationReducer — restore vs. a live/failed session (SSE final event + retry-context safety)', () => {
  it('never overwrites a response that is actively streaming (mid-stream selection change / slow "latest" race)', () => {
    let state = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req() });
    state = generationReducer(state, { type: 'chunk', runId: 1, text: 'still streaming' });
    const restored = generationReducer(state, { type: 'restore', contextKey: 'project', response: null });
    expect(restored).toBe(state); // busy state wins, restore is dropped
  });

  it('does not erase a failed response while the user is still looking at that same context (keeps Retry usable)', () => {
    let state = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req({ filePath: 'src/app.ts' }) });
    state = { ...state, filePath: 'src/app.ts' };
    state = generationReducer(state, { type: 'fail', runId: 1, error: { code: 'AI_EMPTY', message: 'empty', retryable: true } });
    const restored = generationReducer(state, { type: 'restore', contextKey: contextKeyFor('src/app.ts'), response: null });
    expect(restored).toBe(state);
    expect(restored.request).toBeDefined(); // Retry still has the original request to resend
  });

  it('does re-apply a restore once the context actually changes away from the failed one', () => {
    let state = generationReducer(initialGenerationState, { type: 'start', runId: 1, request: req({ filePath: 'src/a.ts' }) });
    state = { ...state, filePath: 'src/a.ts' };
    state = generationReducer(state, { type: 'fail', runId: 1, error: { code: 'AI_EMPTY', message: 'empty', retryable: true } });
    const restored = generationReducer(state, { type: 'restore', contextKey: contextKeyFor('src/b.ts'), response: null });
    expect(restored.status).toBe('idle');
  });

  it('does not re-apply the identical generationId twice (idempotent restore / no flicker on repeated polling)', () => {
    const withGen: GenerationState = { status: 'completed', runId: 1, content: 'answer', generationId: 'g-1' };
    const sameAgain = generationReducer(withGen, { type: 'restore', contextKey: 'project', response: { content: 'answer', generationId: 'g-1', request: req() } });
    expect(sameAgain).toBe(withGen);
  });
});

describe('httpFailure — categorized, safe error messages (no generic "unable to generate" catch-all)', () => {
  it.each([
    [401, 'SESSION_EXPIRED', false],
    [429, 'RATE_LIMITED', true],
    [404, 'REQUEST_FAILED', false],
    [500, 'SERVER_UNAVAILABLE', true],
    [503, 'SERVER_UNAVAILABLE', true],
  ])('status %d -> %s (retryable: %s)', (status, code, retryable) => {
    const failure = httpFailure(status as number);
    expect(failure.code).toBe(code);
    expect(failure.retryable).toBe(retryable);
  });

  it('never leaks the server message on a 401 (would-be session detail)', () => {
    expect(httpFailure(401, 'internal token mismatch').message).not.toContain('internal token mismatch');
  });
});

describe('isBusy', () => {
  it('only connecting/streaming count as busy', () => {
    expect(isBusy('connecting')).toBe(true);
    expect(isBusy('streaming')).toBe(true);
    for (const s of ['idle', 'completed', 'failed', 'cancelled'] as const) expect(isBusy(s)).toBe(false);
  });
});
