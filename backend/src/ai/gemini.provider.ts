import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { ServiceUnavailableError } from '../utils/errors';

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

  public async *generateStream(prompt: string, systemInstruction?: string): AsyncGenerator<string> {
    if (!this.genAI) {
      throw new ServiceUnavailableError('AI service is not configured');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        systemInstruction,
      });

      const result = await model.generateContentStream(prompt);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      console.error('Gemini streaming error:', err);
      throw new ServiceUnavailableError('AI provider request failed');
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
