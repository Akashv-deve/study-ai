import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createSseParser, SseFormatError } from '../lib/sse';
import {
  GenerationError, GenerationRequest, GenerationState, RestoredResponse,
  generationReducer, initialGenerationState,
} from '../lib/aiGeneration';
import { httpFailure } from '../lib/aiGeneration';

/**
 * The backend sends a keepalive comment every 10 s while the model is thinking. If nothing at all
 * (not even a keepalive) arrives for this long, the connection is dead, not slow.
 */
export const STREAM_IDLE_TIMEOUT_MS = 45_000;

const scheduleFrame = (cb: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(cb, 16);
  return () => clearTimeout(id);
};

const isAbortError = (err: unknown) => err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string } | null)?.name === 'AbortError';

interface StreamEventPayload {
  chunk?: unknown;
  done?: unknown;
  generationId?: string;
  conversationId?: string;
  error?: { code?: string; message?: string; retryable?: boolean };
}

/**
 * Runs one AI generation at a time and exposes it as a single state machine (see lib/aiGeneration).
 * Chunks are applied at most once per animation frame so a fast stream cannot flood React with renders.
 */
export function useAIGeneration(projectId: string) {
  const [state, dispatch] = useReducer(generationReducer, initialGenerationState);
  const stateRef = useRef<GenerationState>(state);
  stateRef.current = state;
  const runRef = useRef(0);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, []);

  // A different project means a different world: stop anything running and drop what is on screen.
  useEffect(() => {
    dispatch({ type: 'clear' });
    return () => { controllerRef.current?.abort(); };
  }, [projectId]);

  const generate = useCallback(async (request: GenerationRequest): Promise<boolean> => {
    // Synchronous guard: React state is not updated yet when a second click lands in the same tick.
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    const runId = ++runRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: 'start', runId, request });

    let pending = '';
    let cancelFrame = null as (() => void) | null;
    const flush = () => {
      if (cancelFrame) { cancelFrame(); cancelFrame = null; }
      if (!pending) return;
      const text = pending;
      pending = '';
      if (mountedRef.current) dispatch({ type: 'chunk', runId, text });
    };
    const fail = (error: GenerationError) => { if (mountedRef.current) dispatch({ type: 'fail', runId, error }); };

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, STREAM_IDLE_TIMEOUT_MS);
    };

    let terminal = false; // a `done` or `error` event was received
    try {
      armIdle();
      const response = await fetch(
        request.regenerateId ? `/api/ai/generations/${request.regenerateId}/regenerate` : '/api/ai/generate',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(request.regenerateId ? {} : {
            projectId,
            type: request.type,
            prompt: request.prompt,
            filePath: request.filePath,
            selection: request.selection,
            generationId: request.generationId,
            conversationId: request.conversationId,
          }),
        },
      );
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        fail(httpFailure(response.status, body?.error?.message));
        return false;
      }

      const parser = createSseParser((raw) => {
        const payload = raw as StreamEventPayload;
        if (typeof payload.chunk === 'string' && payload.chunk) {
          pending += payload.chunk;
          if (!cancelFrame) cancelFrame = scheduleFrame(() => { cancelFrame = null; flush(); });
        } else if (payload.done) {
          flush();
          terminal = true;
          if (mountedRef.current) dispatch({ type: 'done', runId, generationId: payload.generationId, conversationId: payload.conversationId });
        } else if (payload.error) {
          flush();
          terminal = true;
          fail({ code: payload.error.code || 'AI_INTERNAL', message: payload.error.message || 'The AI response could not be completed.', retryable: payload.error.retryable !== false });
        }
        // `{ status: 'connected' }` and unknown events are intentionally ignored.
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        armIdle();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.flush(); // a final event that arrived without its blank-line terminator
      flush();
      if (!terminal) {
        // The connection closed cleanly but the server never said the response was finished.
        fail({ code: 'STREAM_ENDED', message: 'The response stream ended before the AI finished. What arrived is shown below.', retryable: true });
      }
      return terminal;
    } catch (err) {
      flush();
      if (terminal || !mountedRef.current) return false;
      if (timedOut) fail({ code: 'STREAM_TIMEOUT', message: 'No data arrived from the server for a long time. Retry to generate the response again.', retryable: true });
      else if (isAbortError(err)) dispatch({ type: 'cancel', runId });
      else if (err instanceof SseFormatError) fail({ code: 'BAD_STREAM', message: 'The response stream was corrupted. Retry to generate it again.', retryable: true });
      else fail({ code: 'NETWORK', message: 'The connection was interrupted before the response finished. Check your connection and retry.', retryable: true });
      return false;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (cancelFrame) cancelFrame();
      if (controllerRef.current === controller) controllerRef.current = null;
      inFlightRef.current = false;
    }
  }, [projectId]);

  /** Re-sends the request exactly as originally issued (same prompt, file, selection, ids), not the current editor context. */
  const retry = useCallback(() => {
    const request = stateRef.current.request;
    return request ? generate(request) : Promise.resolve(false);
  }, [generate]);

  const regenerate = useCallback(() => {
    const s = stateRef.current;
    if (!s.generationId) return Promise.resolve(false);
    return generate({ prompt: '', type: s.type || 'chat', filePath: s.filePath, selection: s.selection, conversationId: s.conversationId, regenerateId: s.generationId });
  }, [generate]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  const restore = useCallback((contextKey: string, response: RestoredResponse | null) => dispatch({ type: 'restore', contextKey, response }), []);
  const setFavorite = useCallback((value: boolean) => dispatch({ type: 'favorite', value }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return { state, generate, retry, regenerate, cancel, restore, setFavorite, clear };
}
