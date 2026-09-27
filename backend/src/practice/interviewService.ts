import mongoose from 'mongoose';
import { InterviewSession, IInterviewSession, InterviewCategory } from '../models/interviewSession.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { geminiProvider } from '../ai/gemini.provider';
import { IProjectPracticeContext } from '../models/projectPracticeContext.model';

const MAX_FOLLOW_UPS_PER_QUESTION = 2;
const MAX_QUESTIONS = 6;
const VALID_CATEGORIES: InterviewCategory[] = ['fundamentals', 'coding', 'debugging', 'architecture', 'project', 'api', 'database', 'frontend', 'backend'];

async function loadOwnedSession(sessionId: string, userId: string): Promise<IInterviewSession> {
  if (!mongoose.isValidObjectId(sessionId)) throw new NotFoundError('Interview session not found');
  const session = await InterviewSession.findOne({ _id: sessionId, userId });
  if (!session) throw new NotFoundError('Interview session not found');
  return session;
}

function parseJson<T>(raw: string): T | null {
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned) as T; } catch { return null; }
}

const QUESTION_SYSTEM_PROMPT = `You are a technical interviewer. Respond with ONLY JSON: {"category":"fundamentals"|"coding"|"debugging"|"architecture"|"project"|"api"|"database"|"frontend"|"backend","question":"the question text"}. Ask one clear, specific, non-generic question appropriate to the candidate's stated technology/project. Never ask something the provided project evidence does not support.`;
const FOLLOWUP_SYSTEM_PROMPT = `You are a technical interviewer conducting a live follow-up. Respond with ONLY JSON: {"question":"the follow-up text"}. Base it directly on the candidate's last answer — probe reasoning, trade-offs, or failure handling. Do not repeat the original question. Do not reveal the ideal answer.`;
const REPORT_SYSTEM_PROMPT = `You are a technical interviewer writing a final report from an actual transcript. Respond with ONLY JSON: {"strengths":["..."],"weakAreas":["..."],"topicsToRevise":["..."],"summary":"2-4 sentences"}. Base every point strictly on what the candidate actually said in the transcript — never invent a strength or weakness the transcript does not support. If an answer was skipped or empty, that counts as a gap, not a strength.`;

interface QuestionJson { category?: string; question?: string }

/** Generates and validates one question, retrying once on malformed/unusable JSON before giving up (Issue
 * #18) — never silently falls back to a generic, ungrounded question. */
async function generateQuestion(promptLines: string[], attempt = 0): Promise<{ category: InterviewCategory; question: string }> {
  const raw = await geminiProvider.generate(promptLines.join('\n'), QUESTION_SYSTEM_PROMPT);
  const parsed = parseJson<QuestionJson>(raw);
  const question = parsed?.question?.trim();
  if (question) {
    const category = VALID_CATEGORIES.includes(parsed?.category as InterviewCategory) ? (parsed!.category as InterviewCategory) : 'fundamentals';
    return { category, question };
  }
  if (attempt < 1) return generateQuestion(promptLines, attempt + 1);
  throw new ValidationError('The interviewer could not generate a question right now. Please try again.');
}

function questionPrompt(technology: string | undefined, projectContext: IProjectPracticeContext | undefined, askedSoFar: string[]): string[] {
  const lines = [technology ? `Technology/topic focus: ${technology}.` : 'General technical interview.'];
  if (projectContext) lines.push(`Ground project-specific questions ONLY in this real evidence:\n${projectContext.digest}`);
  if (askedSoFar.length > 0) lines.push(`Already asked (do not repeat): ${askedSoFar.join('; ')}`);
  return lines;
}

/** Small Issue #17: the first question is generated BEFORE the session is created. If Gemini fails, nothing
 * is ever persisted — there is no broken/empty active session left behind to clean up. */
export async function startInterview(userId: string, params: { technology?: string; projectId?: string; projectContext?: IProjectPracticeContext }): Promise<IInterviewSession> {
  if (!geminiProvider.isAvailable()) throw new ValidationError('AI is not configured on this server.');
  const first = await generateQuestion(questionPrompt(params.technology, params.projectContext, []));
  return InterviewSession.create({
    userId, technology: params.technology, projectId: params.projectId, status: 'active', processing: false,
    turns: [{ category: first.category, question: first.question, followUps: [], askedAt: new Date() }],
  });
}

/** Claims an exclusive right to advance this session (Issue #19: two concurrent submitAnswer calls can
 * never both proceed — the loser is refused immediately, atomically, at the database level, not via an
 * in-memory check that could itself race). Always release with releaseProcessing() in a finally block. */
async function claimProcessing(sessionId: string, userId: string): Promise<IInterviewSession> {
  const claimed = await InterviewSession.findOneAndUpdate(
    { _id: sessionId, userId, status: 'active', processing: { $ne: true } },
    { $set: { processing: true } },
    { new: true },
  );
  if (!claimed) {
    // Distinguish "someone else is mid-request" from "not found/not active" for a clearer error.
    const exists = await InterviewSession.findOne({ _id: sessionId, userId }).select('status');
    if (!exists) throw new NotFoundError('Interview session not found');
    if (exists.status !== 'active') throw new ValidationError('This interview has already ended.');
    throw new ValidationError('Your previous request for this interview is still being processed.');
  }
  return claimed;
}

async function releaseProcessing(sessionId: string): Promise<void> {
  await InterviewSession.updateOne({ _id: sessionId }, { $set: { processing: false } });
}

/** Submits an answer to the current (last) question or its latest follow-up, then either asks a grounded
 * follow-up or moves on. The answer is saved BEFORE any further Gemini call, so a follow-up/next-question
 * generation failure can never lose it (Issue #20) — a follow-up failure is treated as "no follow-up this
 * round" and the interview safely advances instead of getting stuck. */
export async function submitAnswer(sessionId: string, userId: string, answer: string, projectContext?: IProjectPracticeContext): Promise<IInterviewSession> {
  if (typeof answer !== 'string' || !answer.trim()) throw new ValidationError('An answer is required.');
  if (answer.length > 4000) throw new ValidationError('Answer is too long (max 4000 characters).');

  const session = await claimProcessing(sessionId, userId);
  try {
    const turn = session.turns[session.turns.length - 1];
    if (!turn) throw new ValidationError('No active question.');
    const target = turn.followUps.length > 0 ? turn.followUps[turn.followUps.length - 1] : null;
    if (target && !target.answer) target.answer = answer.slice(0, 4000);
    else if (!turn.answer) turn.answer = answer.slice(0, 4000);
    else throw new ValidationError('This question has already been answered.');
    await session.save(); // the answer is durable from this point on, regardless of what happens next

    if (turn.followUps.length < MAX_FOLLOW_UPS_PER_QUESTION) {
      try {
        const raw = await geminiProvider.generate(`Original question: ${turn.question}\nCandidate's latest answer: ${answer}`, FOLLOWUP_SYSTEM_PROMPT);
        const parsed = parseJson<{ question?: string }>(raw);
        if (parsed?.question?.trim()) {
          turn.followUps.push({ question: parsed.question.trim(), askedAt: new Date() });
          await session.save();
          return session;
        }
      } catch {
        // Follow-up generation failed — the answer is already safe. Fall through and advance the
        // interview instead of leaving it stuck with no follow-up and no next question.
      }
    }

    if (session.turns.length >= MAX_QUESTIONS) {
      await completeInterview(session);
    } else {
      const next = await generateQuestion(questionPrompt(session.technology, projectContext, session.turns.map((t) => t.question)));
      session.turns.push({ category: next.category, question: next.question, followUps: [], askedAt: new Date() });
      await session.save();
    }
    return session;
  } finally {
    await releaseProcessing(sessionId);
  }
}

/** Small Issue #18: a malformed/failed report never fabricates an empty "completed" session. The session
 * stays 'active' with every real answer intact, and the caller (endInterview) can simply be called again to
 * retry — nothing here is lost or falsified in the meantime. */
async function completeInterview(session: IInterviewSession): Promise<void> {
  const transcript = session.turns
    .map((t, i) => {
      const followUpText = t.followUps.map((f) => `  Follow-up: ${f.question}\n  Answer: ${f.answer ?? '(not answered)'}`).join('\n');
      return `Q${i + 1} [${t.category}]: ${t.question}\nA: ${t.answer ?? '(not answered)'}\n${followUpText}`;
    })
    .join('\n\n');
  const raw = await geminiProvider.generate(`Interview transcript:\n\n${transcript}`, REPORT_SYSTEM_PROMPT);
  const parsed = parseJson<{ strengths?: string[]; weakAreas?: string[]; topicsToRevise?: string[]; summary?: string }>(raw);
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new ValidationError('The final report could not be generated. Your answers are saved — try ending the interview again.');
  }
  session.report = {
    strengths: (parsed.strengths ?? []).filter((s) => typeof s === 'string').slice(0, 8),
    weakAreas: (parsed.weakAreas ?? []).filter((s) => typeof s === 'string').slice(0, 8),
    topicsToRevise: (parsed.topicsToRevise ?? []).filter((s) => typeof s === 'string').slice(0, 8),
    recommendedChallengeIds: [],
    summary: parsed.summary.slice(0, 1000),
    generatedAt: new Date(),
  };
  session.status = 'completed';
  await session.save();
}

export async function endInterview(sessionId: string, userId: string): Promise<IInterviewSession> {
  const session = await claimProcessing(sessionId, userId);
  try {
    if (session.status === 'active') await completeInterview(session);
    return session;
  } finally {
    await releaseProcessing(sessionId);
  }
}

export async function getInterview(sessionId: string, userId: string): Promise<IInterviewSession> {
  return loadOwnedSession(sessionId, userId);
}

export async function listInterviews(userId: string): Promise<IInterviewSession[]> {
  return InterviewSession.find({ userId }).select('-turns -processing').sort({ updatedAt: -1 }).limit(50);
}
