import { GoogleGenerativeAIFetchError, GoogleGenerativeAIResponseError } from '@google/generative-ai';

export type AIErrorCode =
  | 'AI_RATE_LIMITED'
  | 'AI_OVERLOADED'
  | 'AI_CONFIG'
  | 'AI_BLOCKED'
  | 'AI_EMPTY'
  | 'AI_TIMEOUT'
  | 'AI_CONNECTION'
  | 'AI_CANCELLED'
  | 'AI_INTERNAL';

/** Messages are written for end users. They never include provider text, URLs, keys, or stack traces. */
const DESCRIPTORS: Record<AIErrorCode, { message: string; retryable: boolean }> = {
  AI_RATE_LIMITED: { message: 'The AI provider is rate limited right now. Wait a moment, then retry.', retryable: true },
  AI_OVERLOADED: { message: 'The AI provider is temporarily overloaded. Please retry in a few seconds.', retryable: true },
  AI_CONFIG: { message: 'The AI service is not configured correctly. Retrying will not fix this; the server settings need attention.', retryable: false },
  AI_BLOCKED: { message: 'The AI provider declined to answer this request (safety filter). Try a different selection or wording.', retryable: false },
  AI_EMPTY: { message: 'The AI provider returned an empty response. Please retry.', retryable: true },
  AI_TIMEOUT: { message: 'Generation timed out before the AI provider finished. Please retry.', retryable: true },
  AI_CONNECTION: { message: 'The connection to the AI provider was interrupted. Please retry.', retryable: true },
  AI_CANCELLED: { message: 'Generation was cancelled.', retryable: false },
  AI_INTERNAL: { message: 'The response could not be completed because of a server error. Please retry.', retryable: true },
};

export class AIStreamError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  /** HTTP status reported by the provider, when there was one. Server-side diagnostics only. */
  readonly upstreamStatus?: number;

  constructor(code: AIErrorCode, upstreamStatus?: number) {
    super(DESCRIPTORS[code].message);
    this.name = 'AIStreamError';
    this.code = code;
    this.retryable = DESCRIPTORS[code].retryable;
    this.upstreamStatus = upstreamStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ClassifyHints { cancelled?: boolean; timedOut?: boolean }

const CONNECTION_PATTERN = /terminated|fetch failed|econnreset|socket|network|aborted|other side closed|error fetching from/i;

export function classifyAIError(error: unknown, hints: ClassifyHints = {}): AIStreamError {
  if (error instanceof AIStreamError) return error;
  if (hints.cancelled) return new AIStreamError('AI_CANCELLED');
  if (hints.timedOut) return new AIStreamError('AI_TIMEOUT');

  if (error instanceof GoogleGenerativeAIFetchError) {
    const status = error.status;
    if (status === 429) return new AIStreamError('AI_RATE_LIMITED', status);
    if (status === 408 || status === 504) return new AIStreamError('AI_TIMEOUT', status);
    if (status === 500 || status === 502 || status === 503) return new AIStreamError('AI_OVERLOADED', status);
    if (status === 400 || status === 401 || status === 403 || status === 404) return new AIStreamError('AI_CONFIG', status);
    return new AIStreamError('AI_INTERNAL', status);
  }
  // Thrown by chunk.text() when the provider blocked the response (safety, recitation, language).
  if (error instanceof GoogleGenerativeAIResponseError) return new AIStreamError('AI_BLOCKED');

  const message = error instanceof Error ? error.message : '';
  if (CONNECTION_PATTERN.test(message)) return new AIStreamError('AI_CONNECTION');
  return new AIStreamError('AI_INTERNAL');
}

/** Removes anything key-like from text before it is written to server logs. */
export function redactForLog(text: string): string {
  return text
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .slice(0, 300);
}
