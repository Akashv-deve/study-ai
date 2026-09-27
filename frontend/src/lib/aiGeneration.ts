import { AIGeneration } from '../types';

/**
 * One deterministic source of truth for an AI generation.
 *
 *   idle ──start──▶ connecting ──first chunk──▶ streaming ──done──▶ completed
 *                        │                          │
 *                        └────── error / stream ended / timeout ─────▶ failed
 *   connecting|streaming ──cancel──▶ cancelled
 *
 * `idle` also covers "showing a stored response that was restored, nothing running".
 * Every action that originates from a running request carries its `runId`; anything from an
 * older run is ignored, so a slow or abandoned request can never overwrite a newer one.
 */
export type GenerationStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export interface AISelection { code?: string; startLine?: number; endLine?: number }

/** Everything needed to send (or re-send) a generation exactly as the user originally asked for it. */
export interface GenerationRequest {
  prompt: string;
  type: string;
  filePath?: string;
  selection?: AISelection;
  generationId?: string;
  conversationId?: string;
  /** Set when this request regenerates an existing response. */
  regenerateId?: string;
}

export interface GenerationError { code: string; message: string; retryable: boolean }

export interface GenerationState {
  status: GenerationStatus;
  runId: number;
  content: string;
  generationId?: string;
  conversationId?: string;
  isFavorite?: boolean;
  /** The request that produced (or is producing) what is on screen. Used by Retry. */
  request?: GenerationRequest;
  error?: GenerationError;
  filePath?: string;
  selection?: AISelection;
  type?: string;
  modelName?: string;
  createdAt?: string;
}

export const initialGenerationState: GenerationState = { status: 'idle', runId: 0, content: '' };

export type GenerationAction =
  | { type: 'start'; runId: number; request: GenerationRequest }
  | { type: 'chunk'; runId: number; text: string }
  | { type: 'done'; runId: number; generationId?: string; conversationId?: string }
  | { type: 'fail'; runId: number; error: GenerationError }
  | { type: 'cancel'; runId: number }
  | { type: 'restore'; contextKey: string; response: RestoredResponse | null }
  | { type: 'favorite'; value: boolean }
  | { type: 'clear' };

export interface RestoredResponse {
  content: string;
  generationId?: string;
  conversationId?: string;
  isFavorite?: boolean;
  request: GenerationRequest;
  filePath?: string;
  selection?: AISelection;
  type?: string;
  modelName?: string;
  createdAt?: string;
}

export const isBusy = (status: GenerationStatus) => status === 'connecting' || status === 'streaming';

/** Same formula the backend uses to store and look up a response for one exact context. */
export function contextKeyFor(filePath?: string, selection?: AISelection | null): string {
  if (!filePath) return 'project';
  return `${filePath}${selection?.code ? `:${selection.startLine ?? 0}-${selection.endLine ?? 0}` : ''}`;
}

export const stateContextKey = (s: Pick<GenerationState, 'filePath' | 'selection'>) => contextKeyFor(s.filePath, s.selection);

export function fromGeneration(g: AIGeneration): RestoredResponse {
  return {
    content: g.content,
    generationId: g._id,
    conversationId: g.conversationId,
    isFavorite: g.isFavorite,
    request: { prompt: g.prompt || g.promptSummary || g.title, type: g.type, filePath: g.filePath, selection: g.selection, generationId: g._id, conversationId: g.conversationId },
    filePath: g.filePath,
    selection: g.selection,
    type: g.type,
    modelName: g.modelName || g.model,
    createdAt: g.createdAt,
  };
}

export function generationReducer(state: GenerationState, action: GenerationAction): GenerationState {
  switch (action.type) {
    case 'start':
      // A new run starts from a clean slate: nothing from the previous response (including its
      // generationId / favorite flag) may stay attached to content that has not been produced yet.
      return {
        status: 'connecting',
        runId: action.runId,
        content: '',
        conversationId: action.request.conversationId,
        request: action.request,
        filePath: action.request.filePath,
        selection: action.request.selection,
        type: action.request.type,
      };
    case 'chunk':
      if (action.runId !== state.runId || !isBusy(state.status)) return state;
      return { ...state, status: 'streaming', content: state.content + action.text };
    case 'done':
      if (action.runId !== state.runId || !isBusy(state.status)) return state;
      return { ...state, status: 'completed', error: undefined, generationId: action.generationId ?? state.generationId, conversationId: action.conversationId ?? state.conversationId, createdAt: new Date().toISOString() };
    case 'fail':
      if (action.runId !== state.runId || !isBusy(state.status)) return state;
      // Keep whatever partial text arrived. It is labelled incomplete by the UI, never presented as finished.
      return { ...state, status: 'failed', error: action.error };
    case 'cancel':
      if (action.runId !== state.runId || !isBusy(state.status)) return state;
      return { ...state, status: 'cancelled', error: undefined };
    case 'restore': {
      // Never replace something being generated, and never erase the failure/partial answer of the
      // request the user is still looking at.
      if (isBusy(state.status)) return state;
      if (state.status === 'failed' && state.request && stateContextKey(state) === action.contextKey) return state;
      if (action.response && action.response.generationId && action.response.generationId === state.generationId && state.status !== 'idle') return state;
      return action.response ? { ...action.response, status: 'idle', runId: state.runId } : { ...initialGenerationState, runId: state.runId };
    }
    case 'favorite':
      return { ...state, isFavorite: action.value };
    case 'clear':
      return { ...initialGenerationState, runId: state.runId };
    default:
      return state;
  }
}

/** Categories shown to the user. Never contains provider text, URLs, keys or stack traces. */
const TITLES: Record<string, string> = {
  AI_RATE_LIMITED: 'AI provider rate limited',
  AI_OVERLOADED: 'AI provider temporarily overloaded',
  AI_CONFIG: 'AI service configuration error',
  AI_BLOCKED: 'AI provider declined the request',
  AI_EMPTY: 'AI provider returned an empty response',
  AI_TIMEOUT: 'Generation timed out',
  AI_CONNECTION: 'Connection interrupted',
  AI_CANCELLED: 'Generation cancelled',
  AI_INTERNAL: 'AI provider error',
  RATE_LIMITED: 'Too many requests',
  SESSION_EXPIRED: 'Session expired',
  SERVER_UNAVAILABLE: 'Server temporarily unavailable',
  STREAM_ENDED: 'Response stream ended unexpectedly',
  STREAM_TIMEOUT: 'Generation timed out',
  NETWORK: 'Connection interrupted',
  BAD_STREAM: 'Response stream ended unexpectedly',
  REQUEST_FAILED: 'Request failed',
};
export const errorTitle = (code: string) => TITLES[code] ?? 'AI provider error';

/** Turns a non-2xx answer (before any streaming began) into a user-facing error. */
export function httpFailure(status: number, serverMessage?: string): GenerationError {
  if (status === 401) return { code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again, then retry.', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', message: 'Too many requests in a short time. Wait a moment, then retry.', retryable: true };
  if (status === 404) return { code: 'REQUEST_FAILED', message: serverMessage || 'This project or response no longer exists.', retryable: false };
  if (status >= 500) return { code: 'SERVER_UNAVAILABLE', message: 'The server is temporarily unavailable. Try again in a few seconds.', retryable: true };
  return { code: 'REQUEST_FAILED', message: serverMessage || `The request could not be completed (${status}).`, retryable: false };
}
