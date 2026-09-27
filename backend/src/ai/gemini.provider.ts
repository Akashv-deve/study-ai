import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';
import { classifyAIError, redactForLog } from './aiErrors';

/** No chunk (or first token) for this long means the provider stalled. */
const IDLE_TIMEOUT_MS = 60_000;
/** Hard ceiling for one generation, including thinking time. */
const TOTAL_TIMEOUT_MS = 180_000;

export interface GenerateStreamOptions {
  /** Aborting stops the upstream request (e.g. when the browser disconnects). */
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export class GeminiProvider {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    }
  }

  public isAvailable(): boolean {
    return !!this.genAI;
  }

  public async *generateStream(prompt: string, systemInstruction?: string, options: GenerateStreamOptions = {}): AsyncGenerator<string> {
    if (!this.genAI) {
      throw new ServiceUnavailableError('AI service is not configured');
    }

    const controller = new AbortController();
    let cause: 'client' | 'timeout' | null = null;
    const abort = (reason: 'client' | 'timeout') => { if (!cause) cause = reason; controller.abort(); };
    if (options.signal) {
      if (options.signal.aborted) abort('client');
      else options.signal.addEventListener('abort', () => abort('client'), { once: true });
    }
    const totalTimer = setTimeout(() => abort('timeout'), options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS);
    const idleMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    let idleTimer: NodeJS.Timeout | undefined;
    const armIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => abort('timeout'), idleMs); };

    try {
      armIdle();
      const model = this.genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        systemInstruction,
      });

      const result = await model.generateContentStream(prompt, { signal: controller.signal });
      // The SDK also builds an aggregate `response` promise from the same stream. We only read
      // `stream`, so when the connection breaks mid-flight that second promise rejects with nobody
      // listening, and Node terminates the whole server process on an unhandled rejection.
      // The failure is still surfaced below through the stream loop; this only marks it as handled.
      result.response.catch(() => undefined);

      for await (const chunk of result.stream) {
        armIdle();
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      const error = classifyAIError(err, { cancelled: cause === 'client', timedOut: cause === 'timeout' });
      if (error.code !== 'AI_CANCELLED') {
        // Diagnostics for the operator (Render logs). Never sent to the browser.
        logger.warn('Gemini streaming failed', {
          label: 'ai',
          code: error.code,
          upstreamStatus: error.upstreamStatus,
          errorName: err instanceof Error ? err.name : typeof err,
          detail: err instanceof Error ? redactForLog(err.message) : undefined,
        });
      }
      throw error;
    } finally {
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      // Also releases the upstream connection if the consumer stopped reading early.
      controller.abort();
    }
  }

  public async generate(prompt: string, systemInstruction?: string): Promise<string> {
    if (!this.genAI) {
      return 'AI services are currently unavailable. Please configure GEMINI_API_KEY.';
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        systemInstruction,
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      console.error('Gemini generate error:', err);
      return `Error: ${(err as Error).message}`;
    }
  }
}

export const geminiProvider = new GeminiProvider();
