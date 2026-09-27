'use client';
import React, { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Expand, Heart, RefreshCw, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react';
import { ContextualChat } from './ContextualChat';
import { MarkdownResponse } from './MarkdownResponse';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { GenerationError, GenerationStatus, errorTitle, isBusy } from '../../lib/aiGeneration';

interface AIPanelProps {
  /** The one source of truth for what the generation is doing. */
  status: GenerationStatus;
  content: string;
  error?: GenerationError;
  context?: { filePath?: string; selection?: { startLine?: number; endLine?: number }; type?: string; modelName?: string; createdAt?: string };
  generationId?: string;
  isFavorite?: boolean;
  /** Failure of delete / favourite (not of generation). */
  actionError?: string | null;
  onGenerate: (prompt: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
}

function Progress({ status, onCancel }: { status: 'connecting' | 'streaming'; onCancel?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-lg border border-blue-900/60 bg-blue-950/20 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <Spinner size={16} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-blue-200">Generating response…</p>
          <p className="text-[11px] text-zinc-400 animate-pulse">{status === 'connecting' ? 'Connecting to AI…' : 'Receiving response…'}</p>
        </div>
      </div>
      {onCancel && <Button size="sm" variant="ghost" title="Stop generating" aria-label="Stop generating" onClick={onCancel}><Square size={11} className="mr-1" />Stop</Button>}
    </div>
  );
}

export const AIPanel: React.FC<AIPanelProps> = ({ status, content, error, context, generationId, isFavorite, actionError, onGenerate, onRegenerate, onRetry, onCancel, onDelete, onFavorite }) => {
  const [copied, setCopied] = useState(false); const [full, setFull] = useState(false);
  const busy = isBusy(status);
  const failed = status === 'failed';
  const stopped = status === 'cancelled';
  const hasContent = content.length > 0;
  const retryable = failed ? error?.retryable !== false : stopped;
  const copy = async () => { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 2000); };

  return <div className={`${full ? 'fixed inset-0 z-50' : 'h-full'} flex flex-col bg-[#0d1117] border-l border-[#30363d] p-4 font-sans overflow-y-auto`}>
    <div className="flex items-center justify-between pb-3 border-b border-[#30363d]"><div className="flex items-center gap-2"><Sparkles size={16} className="text-blue-400" /><h3 className="font-semibold text-sm text-white">Study AI Assistant</h3></div><Button size="sm" variant="ghost" title="Full screen" onClick={() => setFull(!full)}>{full ? <X size={14} /> : <Expand size={14} />}</Button></div>
    <div className="flex-1 my-4 space-y-4">
      {status === 'connecting' && <Progress status="connecting" onCancel={onCancel} />}

      {(failed || stopped) && (
        <div role="alert" className="rounded-lg border border-red-900/70 bg-red-950/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-200"><AlertTriangle size={14} />{stopped ? 'Generation stopped' : errorTitle(error?.code ?? '')}</div>
          {hasContent && <p className="text-[11px] font-medium text-yellow-200">Response incomplete</p>}
          <p className="text-[11px] leading-5 text-zinc-300">{stopped ? 'You stopped this response before it finished.' : error?.message}</p>
          {retryable && <Button size="sm" variant="secondary" onClick={onRetry}><RotateCcw size={12} className="mr-1.5" />Retry generation</Button>}
        </div>
      )}

      {hasContent && (
        <div className={`bg-[#161b22] border border-[#30363d] rounded-lg p-4 relative ${failed || stopped ? 'opacity-90' : ''}`}>
          {status === 'streaming' && <div className="mb-3"><Progress status="streaming" onCancel={onCancel} /></div>}
          {context && <p className="mb-2 text-[10px] text-zinc-500">{context.filePath ? `File: ${context.filePath}` : 'Project context'}{context.selection?.startLine ? ` · Lines ${context.selection.startLine}–${context.selection.endLine ?? context.selection.startLine}` : ''}{context.type ? ` · ${context.type.replaceAll('_', ' ')}` : ''}{context.modelName ? ` · ${context.modelName}` : ''}{context.createdAt ? ` · ${new Date(context.createdAt).toLocaleString()}` : ''}</p>}
          {status === 'completed' && <p className="mb-2 flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={12} />Response complete</p>}
          <div className="flex justify-end gap-1 mb-2">
            <Button size="sm" variant="ghost" title="Copy response" aria-label="Copy response" onClick={copy}>{copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}</Button>
            {generationId && !failed && !stopped && <>
              <Button size="sm" variant="ghost" title="Regenerate" aria-label="Regenerate response" disabled={busy} onClick={onRegenerate}><RefreshCw size={12} /></Button>
              <Button size="sm" variant="ghost" title={isFavorite ? 'Remove favourite' : 'Save favourite'} aria-label={isFavorite ? 'Remove favourite' : 'Save favourite'} disabled={busy} onClick={onFavorite}><Heart size={12} className={isFavorite ? 'fill-red-400 text-red-400' : ''} /></Button>
              <Button size="sm" variant="ghost" title="Delete response" aria-label="Delete response" disabled={busy} onClick={onDelete}><Trash2 size={12} /></Button>
            </>}
          </div>
          {actionError && <p role="alert" className="mb-2 text-[11px] text-red-300">{actionError}</p>}
          <MarkdownResponse content={content} />
        </div>
      )}

      {!hasContent && !busy && !failed && !stopped && <div className="text-center py-12 text-zinc-500 text-xs">Ask a question or select code to generate explanations, traces, or code updates.</div>}
      {hasContent && !failed && !stopped && <ContextualChat isLoading={busy} onSend={onGenerate} />}
    </div>
  </div>;
};
