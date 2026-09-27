'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { AlertTriangle, ArrowLeft, History, Lightbulb, MessageCircleQuestion, Play, RotateCcw, Sparkles, Unlock, X } from 'lucide-react';
import { usePracticeAttempt } from '../../../../../hooks/usePracticeAttempt';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import { Spinner } from '../../../../../components/ui/Spinner';
import { hintGate, runStatusLabel, evaluationStatusLabel, isRunnable } from '../../../../../lib/practiceHints';
import { fetchApi } from '../../../../../services/api';
import { AttemptHistoryEntry, AttemptHistoryResponse } from '../../../../../types';

function extensionsFor(path: string) {
  if (/\.py$/.test(path)) return [python()];
  if (/\.html?$/.test(path)) return [html()];
  if (/\.css$/.test(path)) return [css()];
  return [javascript({ jsx: true, typescript: /\.tsx?$/.test(path) })];
}

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

  if (loading) return <div className="h-full flex items-center justify-center gap-2 text-sm text-zinc-500"><Spinner size={16} />Loading challenge…</div>;
  if (error || !challenge || !attempt) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-400">{error || 'This challenge could not be loaded.'}</p>
          <Link href="/workspace/practice"><Button variant="secondary"><ArrowLeft size={14} className="mr-1.5" />Back to Practice Lab</Button></Link>
        </div>
      </div>
    );
  }

  const gate = hintGate(challenge, attempt);
  const runnable = isRunnable(challenge.technology);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <nav className="h-10 shrink-0 border-b border-[#30363d] px-4 flex items-center gap-2 text-xs bg-[#0d1117]">
        <Link href="/workspace/practice" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors"><ArrowLeft size={13} className="mr-1.5" />Practice Lab</Link>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-200 truncate">{challenge.title}</span>
        <Badge variant={challenge.difficulty === 'beginner' ? 'success' : challenge.difficulty === 'intermediate' ? 'warning' : 'error'} className="ml-2">{challenge.difficulty}</Badge>
        <span className="text-zinc-500">Attempt {attempt.attemptNumber}</span>
        <button onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center text-zinc-500 hover:text-zinc-300"><History size={13} className="mr-1" />History</button>
        {saving && <span className="ml-auto text-zinc-500">Saving…</span>}
      </nav>

      {actionError && (
        <div role="alert" className="shrink-0 flex items-center justify-between gap-2 bg-red-950/40 border-b border-red-900 px-4 py-1.5 text-xs text-red-300">
          <span className="flex items-center gap-1.5"><AlertTriangle size={13} />{actionError}</span>
        </div>
      )}

      {showHistory && (
        <div className="shrink-0 border-b border-[#30363d] bg-[#0d1117] px-4 py-2 text-xs max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <p className="text-zinc-400 font-semibold">Attempt history</p>
            <button onClick={() => setShowHistory(false)} className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
          </div>
          {history === null && <p className="text-zinc-500 flex items-center gap-1.5"><Spinner size={12} />Loading history…</p>}
          {history?.length === 0 && <p className="text-zinc-500">No previous attempts.</p>}
          {history?.map((h) => (
            <div key={h.attemptNumber} className="flex items-center gap-2 py-0.5">
              <span className="text-zinc-500 w-16">Attempt {h.attemptNumber}</span>
              <Badge variant={h.status === 'passed' ? 'success' : h.status === 'failed' ? 'error' : h.status === 'abandoned' ? 'warning' : 'info'}>{h.status}</Badge>
              <span className="text-zinc-600">{h.hintsUsed} hint{h.hintsUsed === 1 ? '' : 's'}{h.solutionRevealed ? ' · solution revealed' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[18rem_minmax(0,1fr)_20rem] overflow-hidden">
        <aside className="border-r border-[#30363d] overflow-y-auto p-4 space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Instructions</p>
            <p className="text-zinc-200 whitespace-pre-wrap">{challenge.instructions}</p>
          </div>
          {challenge.expectedBehavior && (
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Expected behavior</p>
              <p className="text-zinc-400 whitespace-pre-wrap">{challenge.expectedBehavior}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="info">{challenge.topic}</Badge>
            {challenge.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        </aside>

        <div className="flex flex-col min-w-0 overflow-hidden">
          {attempt.files.length > 1 && (
            <div className="flex border-b border-[#30363d] bg-[#0d1117] shrink-0 overflow-x-auto">
              {attempt.files.map((f) => (
                <button key={f.path} onClick={() => setActivePath(f.path)} className={`px-3 py-1.5 text-xs font-mono border-r border-[#30363d] whitespace-nowrap ${activeFile?.path === f.path ? 'bg-[#161b22] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {f.path}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            {activeFile && (
              <CodeMirror
                value={activeFile.content}
                theme={oneDark}
                extensions={extensionsFor(activeFile.path)}
                onChange={(value) => updateFile(activeFile.path, value)}
                height="100%"
                style={{ height: '100%', fontSize: 13 }}
              />
            )}
          </div>
          <div className="border-t border-[#30363d] bg-[#0d1117] p-2 flex items-center gap-2 shrink-0 flex-wrap">
            <Button size="sm" onClick={run} disabled={running || !runnable} title={runnable ? undefined : 'Execution for this technology is not available yet — use Check instead.'}>
              {running ? <Spinner size={14} /> : <><Play size={14} className="mr-1" />Run</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={check} disabled={checking}>
              {checking ? <Spinner size={14} /> : <><Sparkles size={14} className="mr-1" />Check</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={requestHint} disabled={requestingHint || !gate.canRequestMore}>
              {requestingHint ? <Spinner size={14} /> : <><Lightbulb size={14} className="mr-1" />Hint ({gate.unlocked}/{gate.total})</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={explainMistake} disabled={explaining || !attempt.evaluation}>
              {explaining ? <Spinner size={14} /> : <><MessageCircleQuestion size={14} className="mr-1" />Explain My Mistake</>}
            </Button>
            <Button size="sm" variant="outline" onClick={revealSolution} disabled={revealing || !gate.allUsed} title={gate.allUsed ? undefined : `Use all ${gate.total} hints first (${gate.unlocked}/${gate.total} used)`}>
              {revealing ? <Spinner size={14} /> : <><Unlock size={14} className="mr-1" />Reveal Solution</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={resetting}>
              {resetting ? <Spinner size={14} /> : <><RotateCcw size={14} className="mr-1" />Reset</>}
            </Button>
          </div>
        </div>

        <aside className="border-l border-[#30363d] overflow-y-auto p-4 space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Run result</p>
            {running ? (
              <p className="flex items-center gap-2 text-zinc-400"><Spinner size={14} />Running…</p>
            ) : (
              <>
                <Badge variant={attempt.runResult?.status === 'passed' ? 'success' : attempt.runResult?.status === 'failed' || attempt.runResult?.status === 'error' ? 'error' : 'info'}>
                  {runStatusLabel(attempt.runResult)}
                </Badge>
                {attempt.runResult?.status && attempt.runResult.status !== 'idle' && attempt.runResult.status !== 'deferred' && (
                  <p className="mt-1 text-[11px] text-zinc-500">This is your browser's own report, not a verdict — click Check for a real evaluation.</p>
                )}
                {attempt.runResult?.output && <pre className="mt-2 text-xs font-mono text-zinc-300 bg-[#0d1117] border border-[#30363d] rounded-md p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">{attempt.runResult.output}</pre>}
                {attempt.runResult?.errors?.map((e, i) => <p key={i} className="mt-1 text-xs text-red-400">{e}</p>)}
              </>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">AI feedback</p>
            {checking ? (
              <p className="flex items-center gap-2 text-zinc-400"><Spinner size={14} />Checking your solution…</p>
            ) : attempt.evaluation ? (
              <>
                <Badge variant={attempt.evaluation.status === 'passed' ? 'success' : attempt.evaluation.status === 'needs_work' ? 'warning' : attempt.evaluation.status === 'failed' ? 'error' : 'info'}>
                  {evaluationStatusLabel(attempt.evaluation)}
                </Badge>
                {attempt.evaluation.feedback && <p className="mt-2 text-zinc-300">{attempt.evaluation.feedback}</p>}
                {!!attempt.evaluation.strengths?.length && (
                  <ul className="mt-2 space-y-0.5">{attempt.evaluation.strengths.map((s, i) => <li key={i} className="text-green-400 text-xs">+ {s}</li>)}</ul>
                )}
                {!!attempt.evaluation.issues?.length && (
                  <ul className="mt-1 space-y-0.5">{attempt.evaluation.issues.map((s, i) => <li key={i} className="text-yellow-400 text-xs">- {s}</li>)}</ul>
                )}
              </>
            ) : (
              <p className="text-zinc-500">Click Check for AI feedback on your code.</p>
            )}
          </div>

          {lastHint && (
            <div className="rounded-md border border-yellow-800 bg-yellow-950/30 p-3">
              <p className="text-xs text-yellow-300 font-semibold mb-1">Hint {lastHint.hintLevel}</p>
              <p className="text-zinc-200 text-xs">{lastHint.hint}</p>
            </div>
          )}

          {explanation && (
            <div className="rounded-md border border-blue-800 bg-blue-950/30 p-3">
              <p className="text-xs text-blue-300 font-semibold mb-1">Explain My Mistake</p>
              <p className="text-zinc-200 text-xs whitespace-pre-wrap">{explanation}</p>
            </div>
          )}

          {solution && (
            <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-1">Reference solution</p>
              <p className="text-zinc-300 text-xs whitespace-pre-wrap">{solution.referenceSolution}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
