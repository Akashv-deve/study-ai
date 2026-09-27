import { PracticeTechnology } from '../models/practiceChallenge.model';
import { RunResult } from '../models/practiceAttempt.model';

/**
 * SECURITY: this module must never import child_process, vm, or call eval/Function on learner-submitted
 * code. For HTML/CSS/JavaScript, "running" the code happens entirely in the browser (see
 * frontend/src/lib/sandboxRunner.ts) inside a sandboxed iframe with no `allow-same-origin`, so it cannot
 * reach the app's cookies, localStorage, or backend. The browser posts its own result back; the backend's
 * job here is only to validate that shape and persist it — it never executes anything itself.
 *
 * For every other technology, real isolated execution requires infrastructure this repository does not
 * have (a container sandbox, gVisor/Firecracker, or similar) and is deliberately NOT implemented. Rather
 * than fake a pass/fail, `run()` returns an honest `deferred` result explaining exactly that.
 */

export const CLIENT_EXECUTED_TECHNOLOGIES: PracticeTechnology[] = ['html', 'css', 'javascript', 'react'];

export function isClientExecuted(technology: PracticeTechnology): boolean {
  return CLIENT_EXECUTED_TECHNOLOGIES.includes(technology);
}

const DEFERRED_MESSAGE: Record<string, string> = {
  react: 'React execution needs a bundler step (JSX transform) the sandbox does not run yet. Use "Check" for AI feedback on your code instead of "Run".',
  nodejs: 'Node.js execution requires an isolated container sandbox that is not deployed yet. Use "Check" for AI feedback on your code instead of "Run".',
  express: 'Express execution requires an isolated container sandbox (with no route to the real network or database) that is not deployed yet. Use "Check" for AI feedback instead.',
  mongodb: 'MongoDB practice requires an isolated, disposable database instance per attempt, which is not deployed yet. Your query is checked by AI instead of executed.',
  java: 'Java execution requires a sandboxed compiler/runtime that is not deployed yet. Use "Check" for AI feedback on your code instead of "Run".',
  python: 'Python execution requires either a server sandbox (not deployed) or a browser WASM runtime (Pyodide) that is not wired up yet. Use "Check" for AI feedback instead of "Run".',
};

/** Accepts and validates a run result the browser sandbox already produced. Never executes anything itself.
 * Always untrusted — see the `trusted` field's doc comment on RunResult. */
export function acceptClientRunResult(input: { status: unknown; output?: unknown; errors?: unknown }): RunResult {
  const status = input.status === 'passed' || input.status === 'failed' || input.status === 'error' ? input.status : 'error';
  const output = typeof input.output === 'string' ? input.output.slice(0, 20_000) : undefined;
  const errors = Array.isArray(input.errors) ? input.errors.filter((e): e is string => typeof e === 'string').slice(0, 50) : undefined;
  return { status, output, errors, ranAt: new Date(), source: 'browser-sandbox', trusted: false };
}

/** For any technology the backend cannot safely execute. Always honest, never a fabricated pass/fail. */
export function deferredRunResult(technology: PracticeTechnology): RunResult {
  return {
    status: 'deferred',
    output: DEFERRED_MESSAGE[technology] ?? `Execution for ${technology} is not available yet.`,
    ranAt: new Date(),
    trusted: false,
  };
}
