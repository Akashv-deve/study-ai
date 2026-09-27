import { IPracticeChallenge } from '../models/practiceChallenge.model';
import { EvaluationResult } from '../models/practiceAttempt.model';
import { geminiProvider } from '../ai/gemini.provider';

export interface CheckInput {
  challenge: Pick<IPracticeChallenge, 'title' | 'instructions' | 'expectedBehavior' | 'evaluationCriteria' | 'technology' | 'topic'>;
  files: { path: string; content: string }[];
  runOutput?: string;
}

/** Deterministic pass before spending an AI call — never invents a pass; only ever narrows to "needs AI judgment".
 * SECURITY: `input.runOutput` must ONLY ever be populated by the caller from a server-TRUSTED source — see
 * attemptService.checkAndEvaluate(), which only forwards runOutput when `runResult.trusted === true`. Today
 * no trusted execution layer exists, so runOutput is always undefined here and this function is effectively
 * inert until one is built — every attempt is judged by AI reading the submitted code instead. */
function checkOutputMatch(input: CheckInput): EvaluationResult | null {
  if (input.runOutput === undefined) return null; // no trusted output to compare — fall through to AI judgment of the actual code
  const { kind, expected, pattern } = input.challenge.evaluationCriteria ?? {};
  if (kind === 'output-match' && expected !== undefined) {
    const actual = input.runOutput.trim();
    const passed = actual === expected.trim();
    return { status: passed ? 'passed' : 'failed', feedback: passed ? 'Output matches exactly.' : `Expected "${expected.trim()}" but got "${actual}".`, evaluatedAt: new Date() };
  }
  if (kind === 'output-regex' && pattern) {
    let re: RegExp;
    try { re = new RegExp(pattern); } catch { return null; }
    const passed = re.test(input.runOutput ?? '');
    return { status: passed ? 'passed' : 'failed', feedback: passed ? 'Output matches the expected pattern.' : 'Output does not match the expected pattern yet.', evaluatedAt: new Date() };
  }
  return null; // ai-only, or no runOutput to check yet
}

const EVAL_SYSTEM_PROMPT = `You are a precise, encouraging coding mentor grading a practice exercise. You are NOT allowed to execute code; judge it by reading it.
Respond with ONLY a JSON object, no markdown fences, matching exactly:
{"status":"passed"|"needs_work"|"failed","feedback":"2-4 sentences, specific to this code","strengths":["short phrase", ...],"issues":["short phrase", ...]}
Rules: "passed" only if the code genuinely satisfies the requirements. "issues" must reference specifics in the submitted code, never generic advice. Never include the reference solution or full corrected code in your response.`;

function buildEvalPrompt(input: CheckInput): string {
  const filesBlock = input.files.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 6000)}`).join('\n\n');
  return [
    `CHALLENGE: ${input.challenge.title} (${input.challenge.technology}, topic: ${input.challenge.topic})`,
    `INSTRUCTIONS:\n${input.challenge.instructions}`,
    input.challenge.expectedBehavior ? `EXPECTED BEHAVIOR:\n${input.challenge.expectedBehavior}` : '',
    `SUBMITTED CODE:\n${filesBlock}`,
    input.runOutput ? `OBSERVED RUN OUTPUT (from the learner's own browser sandbox, not guaranteed complete):\n${input.runOutput.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n\n');
}

function parseEvalJson(raw: string): EvaluationResult {
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
  let parsed: { status?: string; feedback?: string; strengths?: unknown; issues?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { status: 'pending', feedback: 'The evaluator returned an unexpected format. Try Check again.', evaluatedAt: new Date() };
  }
  const status = parsed.status === 'passed' || parsed.status === 'needs_work' || parsed.status === 'failed' ? parsed.status : 'pending';
  const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.filter((s): s is string => typeof s === 'string').slice(0, 6) : [];
  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((s): s is string => typeof s === 'string').slice(0, 6) : [];
  return { status, feedback: typeof parsed.feedback === 'string' ? parsed.feedback.slice(0, 2000) : undefined, strengths, issues, evaluatedAt: new Date() };
}

/** Checks a submission. Tries a deterministic match first; falls back to AI judgment (reusing the existing Gemini provider — no second AI integration). */
export async function checkAttempt(input: CheckInput): Promise<EvaluationResult> {
  const deterministic = checkOutputMatch(input);
  if (deterministic) return deterministic;

  if (!geminiProvider.isAvailable()) {
    return { status: 'pending', feedback: 'AI evaluation is not configured on this server yet.', evaluatedAt: new Date() };
  }
  // geminiProvider.generate() never throws — it returns an "Error: ..." string on failure, which
  // parseEvalJson's malformed-JSON fallback below already handles gracefully.
  const raw = await geminiProvider.generate(buildEvalPrompt(input), EVAL_SYSTEM_PROMPT);
  return parseEvalJson(raw);
}
