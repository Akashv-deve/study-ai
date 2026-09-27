'use client';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import CodeMirror, { ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { ProjectFile } from '../../types';
import { AlertTriangle, Expand, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/Button';

type ViewUpdate = Parameters<NonNullable<ReactCodeMirrorProps['onUpdate']>>[0];

interface CodeViewerProps {
  file: ProjectFile | null;
  content: string;
  /** The selected file's content has not arrived yet. The editor stays mounted; a skeleton covers it. */
  loading?: boolean;
  /** Loading the selected file failed. */
  error?: string | null;
  onRetryLoad?: () => void;
  /** An AI generation is running: asking again is blocked. */
  aiBusy?: boolean;
  onAskAI?: (prompt: string) => void;
  onSelectionChange?: (selection: { code: string; startLine: number; endLine: number } | null) => void;
}

const languageExtensions = (language: string) => (language.toLowerCase() === 'python' ? [python()] : [javascript({ jsx: true, typescript: true })]);

export function LoadingSkeleton({ name }: { name: string }) {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 bg-[#0d1117] p-6 space-y-3">
      <p className="text-xs text-zinc-500 font-sans">Loading {name}…</p>
      {[70, 45, 85, 60, 30, 75, 50, 65, 40, 80].map((width, index) => <div key={index} className="h-3 rounded bg-zinc-800/70 animate-pulse" style={{ width: `${width}%` }} />)}
    </div>
  );
}

export const CodeViewer = React.memo(function CodeViewer({ file, content, loading, error, onRetryLoad, aiBusy, onAskAI, onSelectionChange }: CodeViewerProps) {
  const [full, setFull] = useState(false);
  // Profiling: a new `extensions` array on every render makes CodeMirror reconfigure the editor on every
  // parent render (~0.8 s of pointless work across one streamed response). Keep the identity stable.
  const language = file?.language ?? '';
  const extensions = useMemo(() => languageExtensions(language), [language]);
  const selectionCallback = useRef(onSelectionChange);
  selectionCallback.current = onSelectionChange;
  const handleUpdate = useCallback((update: ViewUpdate) => {
    const report = selectionCallback.current;
    if (!update.selectionSet || !report) return;
    const { from, to } = update.state.selection.main;
    if (from === to) return report(null);
    const doc = update.state.doc;
    report({ code: doc.sliceString(from, to).slice(0, 12_000), startLine: doc.lineAt(from).number, endLine: doc.lineAt(to).number });
  }, []);

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm font-mono">
        Select a file from the explorer tree to view its source code.
      </div>
    );
  }

  return (
    <div className={`${full ? 'fixed inset-0 z-50' : 'h-full'} flex flex-col bg-[#0d1117]`}>
      <div className="h-10 border-b border-[#30363d] px-4 flex items-center justify-between bg-[#161b22] text-xs font-mono">
        <span className="text-zinc-300 font-medium truncate">{file.path}</span>
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="ghost" title="Full screen" onClick={() => setFull(!full)}>{full ? <X size={14} /> : <Expand size={14} />}</Button>
          {onAskAI && (
            <Button size="sm" variant="secondary" disabled={aiBusy || loading || Boolean(error)} onClick={() => onAskAI(`Explain file ${file.path}`)}>
              <Sparkles size={13} className="mr-1.5 text-blue-400" />
              Explain File
            </Button>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-auto text-sm font-mono">
          <CodeMirror
            value={content}
            height="100%"
            theme={oneDark}
            extensions={extensions}
            readOnly
            onUpdate={handleUpdate}
          />
        </div>
        {loading && !error && <LoadingSkeleton name={file.name} />}
        {error && (
          <div role="alert" className="absolute inset-0 z-10 bg-[#0d1117] p-6 space-y-3 text-xs text-zinc-400 font-sans">
            <p className="flex items-center gap-2 text-red-300"><AlertTriangle size={14} />Couldn&apos;t load this file</p>
            <p>{error}</p>
            {onRetryLoad && <Button size="sm" onClick={onRetryLoad}>Try again</Button>}
          </div>
        )}
      </div>
    </div>
  );
});
