export interface Project {
  _id: string;
  name: string;
  description?: string;
  sourceType: 'zip' | 'github';
  processingStatus: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  processingJobId?: string;
  languages: string[];
  frameworks: string[];
  fileCount: number;
  analyzableFileCount: number;
  mainLanguage?: string;
  projectType?: string;
  scanLimits?: { reached: boolean; reasons: string[]; scannedFileCount: number; analyzedFileCount: number };
  updatedAt: string;
  createdAt: string;
}

export interface ProjectFile {
  _id: string;
  projectId: string;
  path: string;
  name: string;
  directory: string;
  extension: string;
  language: string;
  size: number;
  isBinary: boolean;
  isAnalyzable: boolean;
  isAnalyzed?: boolean;
  analysisStatus?: string;
}

export interface ProcessingJob {
  jobId: string;
  projectId: string;
  status: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  error?: string;
}

export interface AIGeneration {
  _id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  filePath?: string;
  selection?: { code?: string; startLine?: number; endLine?: number };
  model: string;
  modelName?: string;
  status: string;
  prompt?: string;
  promptSummary?: string;
  contextKey?: string;
  conversationId?: string;
  isActive?: boolean;
  isFavorite?: boolean;
  createdAt: string;
}

export interface FavoriteResponse extends Omit<AIGeneration, 'projectId'> {
  projectId?: string;
  projectName: string;
  projectDeletedAt?: string;
  sourceGenerationId?: string;
  modelName: string;
}

// ---- Practice Lab / Interview Coach ----

export type PracticeTechnology = 'html' | 'css' | 'javascript' | 'react' | 'nodejs' | 'express' | 'mongodb' | 'java' | 'python';
export type PracticeMode = 'learn' | 'practice' | 'interview' | 'build' | 'debug';
export type PracticeDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface ChallengeFile {
  path: string;
  content: string;
}

/** Never includes referenceSolution / referenceSolutionFiles — those only arrive from the reveal endpoint. */
export interface PracticeChallenge {
  _id: string;
  technology: PracticeTechnology;
  mode: PracticeMode;
  title: string;
  description: string;
  instructions: string;
  difficulty: PracticeDifficulty;
  topic: string;
  tags: string[];
  starterFiles: ChallengeFile[];
  expectedBehavior: string;
  /** Hint TEXT is never sent through normal challenge responses — only hintCount (a safe count) is. The
   * actual next hint is returned solely by POST /practice/attempts/:id/hint, gated server-side. */
  hintCount: number;
  visibility: 'system' | 'project' | 'private';
  source: 'system' | 'ai-generated' | 'project';
  projectId?: string;
  createdAt: string;
}

export interface RunResult {
  status: 'idle' | 'passed' | 'failed' | 'error' | 'deferred';
  output?: string;
  errors?: string[];
  ranAt?: string;
  /** Where this came from — 'browser-sandbox' results are the learner's own browser and are NOT proof of anything. */
  source?: 'browser-sandbox' | 'server';
  /** Only a server-side evaluation can be trusted. A browser-sandbox result is always untrusted and never determines pass/fail on its own — see EvaluationResult / attempt.status instead. */
  trusted: boolean;
}

export interface EvaluationResult {
  status: 'pending' | 'passed' | 'needs_work' | 'failed';
  feedback?: string;
  strengths?: string[];
  issues?: string[];
  evaluatedAt?: string;
}

export interface PracticeAttempt {
  _id: string;
  userId: string;
  challengeId: string;
  projectId?: string;
  files: ChallengeFile[];
  attemptNumber: number;
  hintsUsed: number;
  solutionRevealed: boolean;
  runResult?: RunResult;
  evaluation?: EvaluationResult;
  status: 'in_progress' | 'passed' | 'failed' | 'abandoned';
  updatedAt: string;
}

export interface InterviewFollowUp {
  question: string;
  answer?: string;
}

export interface InterviewTurn {
  category: string;
  question: string;
  answer?: string;
  followUps: InterviewFollowUp[];
}

export interface InterviewReport {
  strengths: string[];
  weakAreas: string[];
  topicsToRevise: string[];
  summary: string;
}

export interface InterviewSession {
  _id: string;
  userId: string;
  technology?: string;
  projectId?: string;
  status: 'active' | 'completed' | 'abandoned';
  turns: InterviewTurn[];
  report?: InterviewReport;
  updatedAt: string;
}

export interface TechnologyProgress {
  technology: string;
  attempted: number;
  solved: number;
  totalAttempts: number;
  hintsUsed: number;
  solutionsRevealed: number;
}

export interface ProgressSummary {
  byTechnology: TechnologyProgress[];
  byTopic: { topic: string; attempted: number; solved: number }[];
  totals: { challengesAttempted: number; challengesSolved: number; totalAttempts: number; hintsUsed: number; solutionsRevealed: number; interviewSessions: number };
  weakTopics: string[];
  recentActivity: { challengeId: string; attemptId: string; attemptNumber: number; title: string; technology: string; status: string; updatedAt: string }[];
}

export interface AttemptHistoryEntry {
  attemptNumber: number;
  status: 'in_progress' | 'passed' | 'failed' | 'abandoned';
  hintsUsed: number;
  solutionRevealed: boolean;
  evaluation?: { status: string; feedback?: string };
  runResult?: { status: string; trusted: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface AttemptHistoryResponse {
  attempts: AttemptHistoryEntry[];
  page: number;
  hasMore: boolean;
}
