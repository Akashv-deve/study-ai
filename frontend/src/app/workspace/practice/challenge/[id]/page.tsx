'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { AlertTriangle, ArrowLeft, ChevronDown, History, Lightbulb, MessageCircleQuestion, Play, RotateCcw, Sparkles, Unlock, X } from 'lucide-react';
import { usePracticeAttempt } from '../../../../../hooks/usePracticeAttempt';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import { Spinner } from '../../../../../components/ui/Spinner';
import { SolutionViewer } from '../../../../../components/practice/SolutionViewer';
import { hintGate, runStatusLabel, evaluationStatusLabel, isRunnable } from '../../../../../lib/practiceHints';
import { extensionsForLanguage, languageForPath } from '../../../../../lib/editorLanguage';
import { fetchApi } from '../../../../../services/api';
import { AttemptHistoryEntry, AttemptHistoryResponse } from '../../../../../types';

export default function ChallengeWorkspace() {
  const { id } = useParams<{ id: string }>();
  const projectId = useSearchParams().get('projectId') || undefined;
  const {
    challenge, attempt, loading, error, actionError, saving, running, checking, requestingHint, revealing, explaining, resetting,
    explanation, lastHint, solution, updateFile, run, check, requestHint, revealSolution, explainMistake, reset,
  } = usePracticeAttempt(String(id), projectId);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AttemptHistoryEntry[] | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(true); // only collapsible below the lg breakpoint

  const activeFile = useMemo(() => {
    if (!attempt) return null;
    return attempt.files.find((f) => f.path === activePath) ?? attempt.files[0] ?? null;
  }, [attempt, activePath]);

  useEffect(() => {
    if (!showHistory || !attempt) return;
    setHistory(null);
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    fetchApi<AttemptHistoryResponse>(`/practice/challenges/${id}/attempts${qs}`).then((res) => setHistory(res.attempts)).catch(() => setHistory([]));
  }, [showHistory, attempt?.attemptNumber, id, projectId]);

  if (loading) return <div role="status" className="h-full min-h-[50dvh] flex items-center justify-center gap-2 text-sm text-zinc-500"><Spinner size={16} />Loading challenge…</div>;
  if (error || !challenge || !attempt) {
    return (
      <div className="h-full min-h-[50dvh] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p role="alert" className="text-sm text-red-400">{error || 'This challenge could not be loaded.'}</p>
          <Link href="/workspace/practice"><Button variant="secondary"><ArrowLeft size={14} className="mr-1.5" aria-hidden="true" />Back to Practice Lab</Button></Link>
        </div>
      </div>
    );
  }

  const gate = hintGate(challenge, attempt);
  const runnable = isRunnable(challenge.technology);

  return (
    // Phones: one vertical column (page scrolls) in the order Challenge → Editor → controls → Output → AI
    // feedback → Hints → Solution. lg+: the original three-column workspace with independent panel scrolling.
    <div className="flex min-h-full flex-col lg:h-full lg:overflow-hidden">
      <nav aria-label="Breadcrumb" className="shrink-0 border-b border-[#30363d] px-3 sm:px-4 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs bg-[#0d1117] min-h-10">
        <Link href="/workspace/practice" className="inline-flex min-h-[44px] lg:min-h-0 items-center text-zinc-400 hover:text-white transition-colors"><ArrowLeft size={13} className="mr-1.5" aria-hidden="true" />Practice Lab</Link>
        <span className="text-zinc-600" aria-hidden="true">/</span>
        <span className="text-zinc-200 min-w-0 break-words max-w-full">{challenge.title}</span>
        <Badge variant={challenge.difficulty === 'beginner' ? 'success' : challenge.difficulty === 'intermediate' ? 'warning' : 'error'}>{challenge.difficulty}</Badge>
        <span className="text-zinc-500">Attempt {attempt.attemptNumber}</span>
        <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="inline-flex min-h-[44px] lg:min-h-0 items-center text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"><History size={13} className="mr-1" aria-hidden="true" />History</button>
        {saving && <span role="status" className="ml-auto text-zinc-500">Saving…</span>}
      </nav>

      {actionError && (
        <div role="alert" className="shrink-0 flex items-start gap-1.5 bg-red-950/40 border-b border-red-900 px-3 sm:px-4 py-2 text-xs text-red-300 break-words">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="min-w-0">{actionError}</span>
        </div>
      )}

      {showHistory && (
        <div className="shrink-0 border-b border-[#30363d] bg-[#0d1117] px-3 sm:px-4 py-2 text-xs max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <p className="text-zinc-400 font-semibold">Attempt history</p>
            <button type="button" onClick={() => setShowHistory(false)} aria-label="Close attempt history" className="inline-flex h-11 w-11 lg:h-6 lg:w-6 items-center justify-center text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"><X size={13} aria-hidden="true" /></button>
          </div>
          {history === null && <p className="text-zinc-500 flex items-center gap-1.5"><Spinner size={12} />Loading history…</p>}
          {history?.length === 0 && <p className="text-zinc-500">No previous attempts.</p>}
          {history?.map((h) => (
            <div key={h.attemptNumber} className="flex flex-wrap items-center gap-2 py-0.5">
              <span className="text-zinc-500 w-16">Attempt {h.attemptNumber}</span>
              <Badge variant={h.status === 'passed' ? 'success' : h.status === 'failed' ? 'error' : h.status === 'abandoned' ? 'warning' : 'info'}>{h.status}</Badge>
              <span className="text-zinc-500">{h.hintsUsed} hint{h.hintsUsed === 1 ? '' : 's'}{h.solutionRevealed ? ' · solution revealed' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:grid lg:flex-1 lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)_20rem] lg:overflow-hidden">
        {/* 1. Challenge */}
        <aside aria-label="Challenge instructions" className="min-w-0 border-b border-[#30363d] lg:border-b-0 lg:border-r lg:overflow-y-auto p-4 text-sm">
          <button type="button" onClick={() => setInstructionsOpen((v) => !v)} aria-expanded={instructionsOpen} className="lg:hidden flex w-full min-h-[44px] items-center justify-between text-xs uppercase tracking-widest text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
            Instructions <ChevronDown size={16} className={`transition-transform ${instructionsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <div className={`${instructionsOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
            <div>
              <p className="hidden lg:block text-xs uppercase tracking-widest text-zinc-500 mb-1">Instructions</p>
              <p className="text-zinc-200 whitespace-pre-wrap break-words">{challenge.instructions}</p>
            </div>
            {challenge.expectedBehavior && (
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Expected behavior</p>
                <p className="text-zinc-400 whitespace-pre-wrap break-words">{challenge.expectedBehavior}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="info">{challenge.topic}</Badge>
              {challenge.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
          </div>
        </aside>

        {/* 2. Editor + controls */}
        <div className="flex min-w-0 flex-col lg:overflow-hidden">
          {attempt.files.length > 1 && (
            <div role="tablist" aria-label="Your files" className="flex border-b border-[#30363d] bg-[#0d1117] shrink-0 overflow-x-auto">
              {attempt.files.map((f) => (
                <button key={f.path} role="tab" aria-selected={activeFile?.path === f.path} type="button" onClick={() => setActivePath(f.path)} className={`px-3 min-h-[44px] lg:min-h-0 lg:py-1.5 text-xs font-mono border-r border-[#30363d] whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${activeFile?.path === f.path ? 'bg-[#161b22] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {f.path}
                </button>
              ))}
            </div>
          )}
          {/* Enough vertical space to actually write code on a phone; long lines scroll inside the editor, never the page. */}
          <div className="h-[55dvh] min-h-[300px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
            {activeFile && (
              <CodeMirror
                value={activeFile.content}
                theme={oneDark}
                extensions={extensionsForLanguage(languageForPath(activeFile.path))}
                onChange={(value) => updateFile(activeFile.path, value)}
                height="100%"
                style={{ height: '100%', fontSize: 14 }}
                aria-label={`Editor: ${activeFile.path}`}
              />
            )}
          </div>
          <div className="sticky bottom-0 z-10 lg:static border-t border-[#30363d] bg-[#0d1117] p-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center shrink-0">
            <Button size="sm" className="w-full sm:w-auto" onClick={run} disabled={running || !runnable} title={runnable ? undefined : 'Execution for this technology is not available yet — use Check instead.'}>
              {running ? <Spinner size={14} /> : <><Play size={14} className="mr-1" aria-hidden="true" />Run</>}
            </Button>
            <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={check} disabled={checking}>
              {checking ? <Spinner size={14} /> : <><Sparkles size={14} className="mr-1" aria-hidden="true" />Check</>}
            </Button>
            <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={requestHint} disabled={requestingHint || !gate.canRequestMore}>
              {requestingHint ? <Spinner size={14} /> : <><Lightbulb size={14} className="mr-1" aria-hidden="true" />Hint ({gate.unlocked}/{gate.total})</>}
            </Button>
            <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={explainMistake} disabled={explaining || !attempt.evaluation}>
              {explaining ? <Spinner size={14} /> : <><MessageCircleQuestion size={14} className="mr-1" aria-hidden="true" />Explain My Mistake</>}
            </Button>
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={revealSolution} disabled={revealing || !gate.allUsed} title={gate.allUsed ? undefined : `Use all ${gate.total} hints first (${gate.unlocked}/${gate.total} used)`}>
              {revealing ? <Spinner size={14} /> : <><Unlock size={14} className="mr-1" aria-hidden="true" />Reveal Solution</>}
            </Button>
            <Button size="sm" variant="ghost" className="w-full sm:w-auto" onClick={reset} disabled={resetting}>
              {resetting ? <Spinner size={14} /> : <><RotateCcw size={14} className="mr-1" aria-hidden="true" />Reset</>}
            </Button>
          </div>
        </div>

        {/* 3. Output → AI feedback → Hints → Explanation → Solution */}
        <aside aria-label="Results" className="min-w-0 border-t border-[#30363d] lg:border-t-0 lg:border-l lg:overflow-y-auto p-4 space-y-4 text-sm">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Run result</h2>
            {running ? (
              <p role="status" className="flex items-center gap-2 text-zinc-400"><Spinner size={14} />Running…</p>
            ) : (
              <>
                <Badge variant={attempt.runResult?.status === 'passed' ? 'success' : attempt.runResult?.status === 'failed' || attempt.runResult?.status === 'error' ? 'error' : 'info'}>
                  {runStatusLabel(attempt.runResult)}
                </Badge>
                {attempt.runResult?.status && attempt.runResult.status !== 'idle' && attempt.runResult.status !== 'deferred' && (
                  <p className="mt-1 text-[11px] text-zinc-500">This is your browser&apos;s own report, not a verdict — click Check for a real evaluation.</p>
                )}
                {attempt.runResult?.output && <pre className="mt-2 text-xs font-mono text-zinc-300 bg-[#0d1117] border border-[#30363d] rounded-md p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">{attempt.runResult.output}</pre>}
                {attempt.runResult?.errors?.map((e, i) => <p key={i} className="mt-1 text-xs text-red-400 break-words">{e}</p>)}
              </>
            )}
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-1">AI feedback</h2>
            {checking ? (
              <p role="status" className="flex items-center gap-2 text-zinc-400"><Spinner size={14} />Checking your solution…</p>
            ) : attempt.evaluation ? (
              <>
                <Badge variant={attempt.evaluation.status === 'passed' ? 'success' : attempt.evaluation.status === 'needs_work' ? 'warning' : attempt.evaluation.status === 'failed' ? 'error' : 'info'}>
                  {evaluationStatusLabel(attempt.evaluation)}
                </Badge>
                {attempt.evaluation.feedback && <p className="mt-2 text-zinc-300 break-words">{attempt.evaluation.feedback}</p>}
                {!!attempt.evaluation.strengths?.length && (
                  <ul className="mt-2 space-y-0.5">{attempt.evaluation.strengths.map((s, i) => <li key={i} className="text-green-400 text-xs break-words">+ {s}</li>)}</ul>
                )}
                {!!attempt.evaluation.issues?.length && (
                  <ul className="mt-1 space-y-0.5">{attempt.evaluation.issues.map((s, i) => <li key={i} className="text-yellow-400 text-xs break-words">- {s}</li>)}</ul>
                )}
              </>
            ) : (
              <p className="text-zinc-500">Click Check for AI feedback on your code.</p>
            )}
          </div>

          <div aria-live="polite" className="space-y-4 empty:hidden">
            {lastHint && (
              <div className="rounded-md border border-yellow-800 bg-yellow-950/30 p-3">
                <p className="text-xs text-yellow-300 font-semibold mb-1">Hint {lastHint.hintLevel}</p>
                <p className="text-zinc-200 text-xs break-words">{lastHint.hint}</p>
              </div>
            )}
            {explanation && (
              <div className="rounded-md border border-blue-800 bg-blue-950/30 p-3">
                <p className="text-xs text-blue-300 font-semibold mb-1">Explain My Mistake</p>
                <p className="text-zinc-200 text-xs whitespace-pre-wrap break-words">{explanation}</p>
              </div>
            )}
          </div>

          {solution && <SolutionViewer technology={challenge.technology} referenceSolution={solution.referenceSolution} referenceSolutionFiles={solution.referenceSolutionFiles} />}
        </aside>
      </div>
    </div>
  );
}
