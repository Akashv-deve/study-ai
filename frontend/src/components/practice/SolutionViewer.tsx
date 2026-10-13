'use client';
import React, { useEffect, useId, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, Maximize2, ShieldCheck, X } from 'lucide-react';
import { ChallengeFile } from '../../types';
import { defaultExtensionForTechnology, extensionsForLanguage, languageForPath, languageLabel } from '../../lib/editorLanguage';

interface SolutionViewerProps {
  technology: string;
  referenceSolution: string;
  referenceSolutionFiles: ChallengeFile[];
}

/** Turns whatever the reveal endpoint returned into a list of displayable code files. A multi-file solution
 * is shown as tabs; if the challenge stored no files, the solution text itself is shown as ONE code file in
 * the challenge's language (never as a paragraph). Pure — exported for tests. */
export function solutionToFiles(technology: string, referenceSolution: string, files: ChallengeFile[]): { files: ChallengeFile[]; explanation: string | null } {
  if (files.length > 0) return { files, explanation: referenceSolution.trim() ? referenceSolution : null };
  return { files: [{ path: `solution.${defaultExtensionForTechnology(technology)}`, content: referenceSolution }], explanation: null };
}

/** The official reference solution, shown only after the explicit reveal flow. Visually distinct (emerald
 * frame + "Solution Revealed" banner) from the learner's own code (dark editor), run output (grey) and AI
 * feedback (badge cards), and it never touches the learner's editor content. */
export const SolutionViewer: React.FC<SolutionViewerProps> = ({ technology, referenceSolution, referenceSolutionFiles }) => {
  const { files, explanation } = useMemo(() => solutionToFiles(technology, referenceSolution, referenceSolutionFiles), [technology, referenceSolution, referenceSolutionFiles]);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tabsId = useId();
  const file = files[Math.min(active, files.length - 1)];
  const language = languageForPath(file.path);
  const multi = files.length > 1;

  useEffect(() => { setActive(0); }, [files]);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(file.content); setCopied(true); } catch { setCopied(false); }
  };

  const editor = (fullHeight: boolean) => (
    <CodeMirror
      value={file.content}
      theme={oneDark}
      extensions={extensionsForLanguage(language)}
      readOnly
      editable={false}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
      height={fullHeight ? '100%' : undefined}
      maxHeight={fullHeight ? undefined : '24rem'}
      style={{ fontSize: 13 }}
      aria-label={`Solution code: ${file.path}`}
    />
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-emerald-900/60 bg-emerald-950/30">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-emerald-100" title={file.path}>{file.path}</p>
        <p className="text-[11px] text-emerald-300/70">{languageLabel(language)}</p>
      </div>
      <button type="button" onClick={copy} className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-md border border-emerald-800 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {multi ? 'Copy File' : 'Copy Code'}
      </button>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Close expanded solution' : 'Expand solution'} className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md border border-emerald-800 p-1.5 text-emerald-100 hover:bg-emerald-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
        {expanded ? <X size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );

  const tabs = multi && (
    <div className="border-b border-emerald-900/60 bg-emerald-950/20">
      <p id={tabsId} className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">Solution Files</p>
      <div role="tablist" aria-labelledby={tabsId} className="flex overflow-x-auto">
        {files.map((f, i) => (
          <button key={f.path} role="tab" aria-selected={i === active} type="button" onClick={() => setActive(i)}
            className={`whitespace-nowrap px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 font-mono text-xs border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${i === active ? 'border-emerald-400 text-white bg-emerald-900/30' : 'border-transparent text-emerald-200/70 hover:text-white'}`}>
            {f.path}
          </button>
        ))}
      </div>
    </div>
  );

  const body = (
    <>
      {tabs}
      {toolbar}
    </>
  );

  return (
    <section aria-label="Revealed solution" className="rounded-lg border-2 border-emerald-700/70 bg-[#0d1117] overflow-hidden min-w-0">
      <div className="flex items-center gap-2 bg-emerald-900/40 px-3 py-2">
        <ShieldCheck size={16} className="shrink-0 text-emerald-300" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-emerald-100">Solution Revealed</h3>
          <p className="text-[11px] text-emerald-200/70">Official reference solution. Your own code has not been changed.</p>
        </div>
      </div>
      {body}
      <div className="min-w-0 overflow-hidden">{editor(false)}</div>
      {explanation && (
        <div className="border-t border-emerald-900/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">Explanation</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-300">{explanation}</p>
        </div>
      )}
      {expanded && (
        <div role="dialog" aria-modal="true" aria-label="Expanded solution" className="fixed inset-0 z-[60] flex flex-col bg-[#0d1117]">
          <div className="flex items-center gap-2 bg-emerald-900/40 px-3 py-2">
            <ShieldCheck size={16} className="text-emerald-300" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-emerald-100">Solution Revealed</h3>
          </div>
          {body}
          <div className="min-h-0 flex-1 overflow-hidden">{editor(true)}</div>
        </div>
      )}
    </section>
  );
};
