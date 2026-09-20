'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { AIPanel } from '../../../../../components/ai/AIPanel';
import { CodeViewer } from '../../../../../components/explorer/CodeViewer';
import { FileTree } from '../../../../../components/explorer/FileTree';
import { StatePanel } from '../../../../../components/workspace/StatePanel';
import { Button } from '../../../../../components/ui/Button';
import { Spinner } from '../../../../../components/ui/Spinner';
import { useProject } from '../../../../../hooks/useProject';
import { fetchApi } from '../../../../../services/api';
import { AIGeneration, ProjectFile } from '../../../../../types';
import { useAppStore } from '../../../../../state/store';

interface StreamState { content: string; generationId?: string; conversationId?: string; isFavorite?: boolean; incomplete?: boolean; retryPrompt?: string; filePath?: string; selection?: { code?: string; startLine?: number; endLine?: number }; type?: string; modelName?: string; createdAt?: string; }
type FilesState = 'idle' | 'loading' | 'ready' | 'error';

export default function ExplorerPage() {
  const { id } = useParams<{ id: string }>();
  const { project, error, loading, reload } = useProject(id);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filesState, setFilesState] = useState<FilesState>('idle');
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesReload, setFilesReload] = useState(0);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [content, setContent] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState>({ content: '' });
  const [streaming, setStreaming] = useState(false);
  const selectRequest = useRef(0);
  const setStoreFile = useAppStore((state) => state.setActiveFile);
  const setStoreFiles = useAppStore((state) => state.setFiles);
  const activeSelection = useAppStore((state) => state.activeSelection);
  const setActiveSelection = useAppStore((state) => state.setActiveSelection);

  const ready = project?.processingStatus === 'ready';

  // Navigating between projects reuses this component, so clear everything tied to the previous one.
  useEffect(() => {
    selectRequest.current += 1;
    setFiles([]); setFilesState('idle'); setFilesError(null);
    setActiveFile(null); setContent(''); setFileError(null);
    setStream({ content: '' });
    setStoreFiles([]); setStoreFile(null); setActiveSelection(null);
  }, [id, setStoreFiles, setStoreFile, setActiveSelection]);

  // Restore only the exact project/file/selection context currently in view.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const key = encodeURIComponent(activeFile ? `${activeFile.path}${activeSelection?.code ? `:${activeSelection.startLine ?? 0}-${activeSelection.endLine ?? 0}` : ''}` : 'project');
    fetchApi<AIGeneration | null>(`/ai/projects/${id}/latest?contextKey=${key}`)
      .then((latest) => { if (!cancelled) setStream(latest ? { content: latest.content, generationId: latest._id, conversationId: latest.conversationId, isFavorite: latest.isFavorite, retryPrompt: latest.prompt || latest.promptSummary || latest.title, filePath: latest.filePath, selection: latest.selection, type: latest.type, modelName: latest.modelName || latest.model, createdAt: latest.createdAt } : { content: '' }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, ready, activeFile, activeSelection]);

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

  const selectFile = useCallback(async (file: ProjectFile) => {
    const requestId = ++selectRequest.current;
    setFileError(null);
    try {
      const data = await fetchApi<{ file: ProjectFile; content: string }>(`/projects/${id}/files/${file._id}/content`);
      if (requestId !== selectRequest.current) return;
      setActiveFile(file); setContent(data.content); setStoreFile(file, data.content);
      setActiveSelection(null);
    } catch (err) {
      if (requestId !== selectRequest.current) return;
      setFileError(`Couldn't open ${file.path}: ${(err as Error).message}`);
    }
  }, [id, setStoreFile, setActiveSelection]);

  const generate = useCallback(async (prompt: string, regenerateId?: string) => {
    if (streaming) return;
    const retained = stream;
    setStreaming(true); setStream({ ...retained, content: '', incomplete: false, retryPrompt: prompt || retained.retryPrompt, filePath: activeFile?.path ?? retained.filePath, selection: activeSelection || retained.selection, type: activeFile ? 'file_explanation' : (retained.type || 'chat') });
    try {
      const response = await fetch(regenerateId ? `/api/ai/generations/${regenerateId}/regenerate` : '/api/ai/generate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(regenerateId ? {} : { projectId: id, type: activeFile ? 'file_explanation' : 'chat', prompt, filePath: activeFile?.path, selection: activeSelection || undefined, generationId: stream.generationId, conversationId: stream.conversationId }) });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error?.message || `Request failed (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let next = { ...retained, content: '', incomplete: false, retryPrompt: prompt || retained.retryPrompt, filePath: activeFile?.path ?? retained.filePath, selection: activeSelection || retained.selection, type: activeFile ? 'file_explanation' : (retained.type || 'chat') } as StreamState;
      const processEvents = (events: string[]) => { for (const event of events) { if (!event.startsWith('data: ')) continue; const payload = JSON.parse(event.slice(6)); if (payload.chunk) { next = { ...next, content: next.content + payload.chunk }; setStream(next); } if (payload.done) { next = { ...next, generationId: payload.generationId, conversationId: payload.conversationId, incomplete: false }; setStream(next); } if (payload.error) throw new Error(payload.error.message); } };
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() || ''; processEvents(events); }
      buffer += decoder.decode(); if (buffer.trim()) processEvents([buffer]);
    } catch (error) { setStream((current) => ({ ...(current.content ? current : retained), incomplete: true, content: current.content || retained.content || `Generation failed: ${(error as Error).message}` })); } finally { setStreaming(false); }
  }, [activeFile, activeSelection, id, stream, streaming]);

  const deleteResponse = useCallback(async () => {
    if (!stream.generationId || !window.confirm('Delete this AI response?')) return;
    await fetchApi(`/ai/generations/${stream.generationId}`, { method: 'DELETE' });
    setStream({ content: '' });
  }, [stream.generationId]);
  const favoriteResponse = useCallback(async () => {
    if (!stream.generationId) return;
    await fetchApi(`/ai/generations/${stream.generationId}/favorite`, { method: stream.isFavorite ? 'DELETE' : 'POST' });
    setStream((current) => ({ ...current, isFavorite: !current.isFavorite }));
  }, [stream.generationId, stream.isFavorite]);

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
      <nav aria-label="Breadcrumb" className="h-10 shrink-0 border-b border-[#30363d] px-4 flex items-center gap-2 text-xs bg-[#0d1117]">
        <Link href="/workspace" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors"><ArrowLeft size={13} className="mr-1.5" />Projects</Link>
        <span className="text-zinc-600">/</span>
        <Link href={`/workspace/projects/${id}`} className="text-zinc-400 hover:text-white transition-colors truncate max-w-[16rem]">{project.name}</Link>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-200">Code Explorer</span>
      </nav>
      <div className="flex-1 min-h-0 grid grid-cols-[15rem_minmax(0,1fr)_22rem] grid-rows-[minmax(0,1fr)] overflow-hidden">
        <aside className="border-r border-[#30363d] flex flex-col min-h-0">
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
            <div className="flex-1 min-h-0"><FileTree files={files} activePath={activeFile?.path} onSelectFile={selectFile} /></div>
          )}
        </aside>
        <div className="relative min-w-0 h-full overflow-hidden">
          {fileError && <div role="alert" className="absolute top-2 left-2 right-2 z-10 rounded-md border border-red-800 bg-red-950/90 px-3 py-2 text-xs text-red-200">{fileError}</div>}
          <CodeViewer file={activeFile} content={content} onAskAI={generate} onSelectionChange={setActiveSelection} />
        </div>
        <AIPanel streamOutput={stream.content} isStreaming={streaming} incomplete={stream.incomplete} context={stream} onGenerate={generate} generationId={stream.generationId} isFavorite={stream.isFavorite} onRegenerate={() => void generate('', stream.generationId)} onRetry={() => void generate(stream.retryPrompt || '', stream.generationId)} onDelete={() => void deleteResponse()} onFavorite={() => void favoriteResponse()} />
      </div>
    </div>
  );
}
