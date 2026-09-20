import { FileContent } from '../models/fileContent.model';
import { AIGeneration } from '../models/aiGeneration.model';
import { Message } from '../models/message.model';

const MAX_FILE_CONTEXT = 12_000;
const MAX_GENERATION_CONTEXT = 10_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 12_000;

export interface ContextRequest {
  projectId: string;
  filePath?: string;
  selection?: { code?: string; startLine?: number; endLine?: number };
  generationId?: string;
  conversationId?: string;
}

/** Builds a bounded, explicitly scoped prompt context. It never scans arbitrary files. */
export async function buildContext(input: ContextRequest): Promise<string> {
  const sections: string[] = [];
  if (input.filePath) {
    const file = await FileContent.findOne({ projectId: input.projectId, filePath: input.filePath }).lean();
    if (file) sections.push(`CURRENT FILE: ${input.filePath}\n${file.content.slice(0, MAX_FILE_CONTEXT)}`);
  }
  if (input.selection?.code) sections.push(`SELECTED CODE:\n${input.selection.code.slice(0, MAX_FILE_CONTEXT)}`);
  if (input.generationId) {
    const generation = await AIGeneration.findOne({ _id: input.generationId, projectId: input.projectId }).lean();
    if (generation) sections.push(`ORIGINAL AI RESULT:\n${generation.content.slice(0, MAX_GENERATION_CONTEXT)}`);
  }
  if (input.conversationId) {
    const messages = await Message.find({ conversationId: input.conversationId }).sort({ createdAt: -1 }).limit(MAX_HISTORY_MESSAGES).lean();
    const history = messages.reverse().map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n');
    if (history) sections.push(`CONVERSATION HISTORY:\n${history.slice(0, MAX_HISTORY_CHARS)}`);
  }
  return sections.join('\n\n---\n\n');
}
