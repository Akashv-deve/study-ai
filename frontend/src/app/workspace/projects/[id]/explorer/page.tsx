'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { AIPanel } from '../../../../../components/ai/AIPanel';
import { useConversationThread } from '../../../../../hooks/useConversationThread';
import { CodeViewer } from '../../../../../components/explorer/CodeViewer';
import { FileTree } from '../../../../../components/explorer/FileTree';
import { StatePanel } from '../../../../../components/workspace/StatePanel';
import { Button } from '../../../../../components/ui/Button';
import { Spinner } from '../../../../../components/ui/Spinner';
import { useAIGeneration } from '../../../../../hooks/useAIGeneration';
import { useFileSelection } from '../../../../../hooks/useFileSelection';
import { useProject } from '../../../../../hooks/useProject';
import { RestoredResponse, contextKeyFor, fromGeneration, isBusy, stateContextKey } from '../../../../../lib/aiGeneration';
import { fetchApi } from '../../../../../services/api';
import { AIGeneration, ProjectFile } from '../../../../../types';
import { useAppStore } from '../../../../../state/store';

type FilesState = 'idle' | 'loading' | 'ready' | 'error';
/** How long a selection must stay put before we look up the stored response for it. */
const RESTORE_DEBOUNCE_MS = 250;

export default function ExplorerPage() {
  const { id } = useParams<{ id: string }>();
  const { project, error, loading, reload } = useProject(id);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'files' | 'code' | 'ai'>('files');
  const [filesState, setFilesState] = useState<FilesState>('idle');
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesReload, setFilesReload] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const setStoreFiles = useAppStore((state) => state.setFiles);
  const activeSelection = useAppStore((state) => state.activeSelection);
  const setActiveSelection = useAppStore((state) => state.setActiveSelection);

  const { activeFile, content, loading: fileLoading, error: fileError, selectFile, retryLoad } = useFileSelection(id);
  const { state: ai, generate, retry, regenerate, cancel, restore, setFavorite, clear } = useAIGeneration(id);
  // Task 13: re-fetches once a turn finishes (status/generationId change), so a completed follow-up joins
  // the visible thread from the persisted Conversation/Message backend rather than only living in memory.
  const conversationThread = useConversationThread(ai.conversationId, `${ai.status}:${ai.generationId ?? ''}`);
  const busy = isBusy(ai.status);
  const ready = project?.processingStatus === 'ready';
  const contextKey = contextKeyFor(activeFile?.path, activeSelection);

  // Latest stored response per context for this project, so returning to a context never re-asks the server.
  const restoreCache = useRef(new Map<string, RestoredResponse | null>());
  // The click handlers below are identity-stable (so memoised children are not re-rendered on every AI
  // chunk) and read the current values through this ref instead.
  const live = useRef({ activeFile, activeSelection, ai });
  live.current = { activeFile, activeSelection, ai };

  useEffect(() => {
    restoreCache.current = new Map();
    setFiles([]); setFilesState('idle'); setFilesError(null); setActionError(null);
    setStoreFiles([]);
  }, [id, setStoreFiles]);

  // Keep the per-context cache in step with what is on screen once a response is durable.
  useEffect(() => {
    if ((ai.status === 'completed' || ai.status === 'idle') && ai.generationId && ai.request) {
      restoreCache.current.set(stateContextKey(ai), { content: ai.content, generationId: ai.generationId, conversationId: ai.conversationId, isFavorite: ai.isFavorite, request: ai.request, filePath: ai.filePath, selection: ai.selection, type: ai.type, modelName: ai.modelName, createdAt: ai.createdAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.status, ai.generationId, ai.isFavorite]);

  // Show the stored response for exactly the context in view. Never while something is being generated,
  // and a selection that is still being dragged does not cause a request per step.
  useEffect(() => {
    if (!ready || busy) return;
    const cached = restoreCache.current.get(contextKey);
    if (cached !== undefined) { restore(contextKey, cached); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchApi<AIGeneration | null>(`/ai/projects/${id}/latest?contextKey=${encodeURIComponent(contextKey)}`, { signal: controller.signal })
        .then((latest) => {
          const response = latest ? fromGeneration(latest) : null;
          restoreCache.current.set(contextKey, response);
          restore(contextKey, response);
        })
        // Best effort: if the lookup fails (or is superseded) the current view stays, and it is labelled with its own file/selection.
        .catch(() => undefined);
    }, RESTORE_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [id, ready, busy, contextKey, restore]);

  // GET /projects/:id/files — only once the project is known to be ready.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setFilesState('loading'); setFilesError(null);
    fetchApi<ProjectFile[]>(`/projects/${id}/files`)
      .then((data) => { if (cancelled) return; setFiles(data); setStoreFiles(data); setFilesState('ready'); })
      .catch((err: unknown) => { if (cancelled) return; setFilesError((err as Error).message); setFilesState('error'); });
    return () => { cancelled = true; };
  }, [id, ready, filesReload, setStoreFiles]);

  const ask = useCallback((prompt: string) => {
    setMobilePanel('ai');
    const { activeFile: file, activeSelection: selection, ai: current } = live.current;
    // A follow-up may continue a conversation only when it is about the same file/selection as that response.
    const continues = Boolean(current.generationId) && stateContextKey(current) === contextKeyFor(file?.path, selection);
    setActionError(null);
    void generate({
      prompt,
      type: file ? 'file_explanation' : 'chat',
      filePath: file?.path,
      selection: selection ?? undefined,
      generationId: continues ? current.generationId : undefined,
      conversationId: continues ? current.conversationId : undefined,
    });
  }, [generate]);

  const deleteResponse = useCallback(async () => {
    const { ai: current } = live.current;
    if (!current.generationId || !window.confirm('Delete this AI response?')) return;
    setActionError(null);
    try {
      await fetchApi(`/ai/generations/${current.generationId}`, { method: 'DELETE' });
      restoreCache.current.set(stateContextKey(current), null);
      clear();
    } catch (err) { setActionError(`Couldn't delete the response: ${(err as Error).message}`); }
  }, [clear]);

  const favoriteResponse = useCallback(async () => {
    const { ai: current } = live.current;
    if (!current.generationId) return;
    setActionError(null);
    try {
      await fetchApi(`/ai/generations/${current.generationId}/favorite`, { method: current.isFavorite ? 'DELETE' : 'POST' });
      setFavorite(!current.isFavorite);
    } catch (err) { setActionError(`Couldn't update the favourite: ${(err as Error).message}`); }
  }, [setFavorite]);

  const onRegenerate = useCallback(() => { setActionError(null); void regenerate(); }, [regenerate]);
  const onRetry = useCallback(() => { setActionError(null); void retry(); }, [retry]);

  const backToProjects = (
    <Link href="/workspace">
      <Button variant="secondary"><ArrowLeft size={14} className="mr-1.5" />Back to projects</Button>
    </Link>
  );

  if (loading) return <StatePanel tone="loading" title="Loading project…" />;

  if (error || !project) {
    const failure = error ?? { kind: 'unavailable' as const, message: 'Project could not be loaded.' };
    if (failure.kind === 'unauthorized') {
      return (
        <StatePanel tone="warning" title="Session expired" actions={<Link href={`/login?next=${encodeURIComponent(`/workspace/projects/${id}/explorer`)}`}><Button>Sign in</Button></Link>}>
          <p>{failure.message}</p>
        </StatePanel>
      );
    }
    if (failure.kind === 'not-found') {
      return (
        <StatePanel tone="warning" title="Project not found" actions={backToProjects}>
          <p>{failure.message}</p>
        </StatePanel>
      );
    }
    return (
      <StatePanel tone="error" title="Couldn't load this project" actions={<><Button onClick={() => void reload()}>Try again</Button>{backToProjects}</>}>
        <p>{failure.message}</p>
      </StatePanel>
    );
  }

  if (!ready) {
    const failed = project.processingStatus === 'failed';
    return (
      <StatePanel
        tone={failed ? 'error' : 'info'}
        title={failed ? 'Processing failed' : 'Project is not ready yet'}
        actions={<><Link href={`/workspace/projects/${id}`}><Button>View project status</Button></Link>{backToProjects}</>}
      >
        <p>{failed ? "This project couldn't be indexed, so there are no files to explore." : `The Code Explorer opens once processing finishes (current status: ${project.processingStatus}).`}</p>
      </StatePanel>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <nav aria-label="Breadcrumb" className="h-10 shrink-0 border-b border-[#30363d] px-3 sm:px-4 flex items-center gap-2 text-xs bg-[#0d1117] overflow-x-auto">
        <Link href="/workspace" className="inline-flex min-h-[44px] lg:min-h-0 items-center text-zinc-400 hover:text-white transition-colors shrink-0"><ArrowLeft size={13} className="mr-1.5" aria-hidden="true" />Projects</Link>
        <span className="text-zinc-600" aria-hidden="true">/</span>
        <Link href={`/workspace/projects/${id}`} className="text-zinc-400 hover:text-white transition-colors truncate max-w-[8rem] sm:max-w-[16rem]">{project.name}</Link>
        <span className="text-zinc-600" aria-hidden="true">/</span>
        <span className="text-zinc-200 shrink-0">Code Explorer</span>
      </nav>
      {/* Below lg: one panel at a time via tabs (a live editor + file tree + AI panel cannot usefully share a
          360-430px screen at once). lg+: the original three-column layout, unchanged. */}
      <div role="tablist" aria-label="Explorer panel" className="lg:hidden shrink-0 flex border-b border-[#30363d] bg-[#0d1117]">
        {([['files', 'Files'], ['code', 'Code'], ['ai', 'AI']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={mobilePanel === key} type="button" onClick={() => setMobilePanel(key)}
            className={`flex-1 min-h-[44px] text-sm font-medium border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${mobilePanel === key ? 'border-blue-500 text-white bg-[#161b22]' : 'border-transparent text-zinc-400'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)] overflow-hidden">
        <aside className={`${mobilePanel === 'files' ? 'flex' : 'hidden'} lg:flex border-r border-[#30363d] flex-col min-h-0 flex-1 lg:flex-auto`}>
          {(filesState === 'idle' || filesState === 'loading') && (
            <div role="status" className="flex-1 flex items-center justify-center gap-2 text-xs text-zinc-500"><Spinner size={16} />Loading files…</div>
          )}
          {filesState === 'error' && (
            <div role="alert" className="p-4 space-y-3 text-xs text-zinc-400">
              <p className="flex items-center gap-2 text-red-300"><AlertTriangle size={14} />Couldn&apos;t load files</p>
              <p>{filesError}</p>
              <Button size="sm" onClick={() => setFilesReload((count) => count + 1)}>Try again</Button>
            </div>
          )}
          {filesState === 'ready' && files.length === 0 && (
            <p className="p-4 text-xs text-zinc-500">No files were indexed for this project.</p>
          )}
          {filesState === 'ready' && files.length > 0 && (
            <div className="flex-1 min-h-0"><FileTree files={files} activePath={activeFile?.path} onSelectFile={(f) => { selectFile(f); setMobilePanel('code'); }} /></div>
          )}
        </aside>
        <div className={`${mobilePanel === 'code' ? 'flex' : 'hidden'} lg:block min-w-0 h-full flex-1 lg:flex-auto overflow-hidden`}>
          <CodeViewer file={activeFile} content={content} loading={fileLoading} error={fileError} onRetryLoad={retryLoad} aiBusy={busy} onAskAI={ask} onSelectionChange={setActiveSelection} />
        </div>
        <div className={`${mobilePanel === 'ai' ? 'flex flex-col' : 'hidden'} lg:flex lg:flex-col min-h-0 flex-1 lg:flex-auto overflow-hidden`}>
        <AIPanel status={ai.status} content={ai.content} error={ai.error} context={{ ...ai, request: ai.request }} generationId={ai.generationId} isFavorite={ai.isFavorite} actionError={actionError} priorTurns={conversationThread} onGenerate={ask} onRegenerate={onRegenerate} onRetry={onRetry} onCancel={cancel} onDelete={() => void deleteResponse()} onFavorite={() => void favoriteResponse()} />
        </div>
      </div>
    </div>
  );
}
