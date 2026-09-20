'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Code2, RotateCcw, Sparkles } from 'lucide-react';
import { fetchApi } from '../../../../services/api';
import { AIGeneration, ProcessingJob, Project } from '../../../../types';
import { MarkdownResponse } from '../../../../components/ai/MarkdownResponse';
import { useProject } from '../../../../hooks/useProject';
import { StatePanel } from '../../../../components/workspace/StatePanel';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Spinner } from '../../../../components/ui/Spinner';

type ProcessingStatus = Project['processingStatus'];

const isTerminal = (status: ProcessingStatus) => status === 'ready' || status === 'failed' || status === 'cancelled';
const statusVariant = (status: ProcessingStatus) => (status === 'ready' ? 'success' : status === 'failed' ? 'error' : 'warning');

export default function ProjectOverview() {
  const { id } = useParams<{ id: string }>();
  const { project, error, loading, reload, refresh } = useProject(id);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AIGeneration | null>(null);
  const [overviewText, setOverviewText] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const status = project?.processingStatus;
  const jobId = project?.processingJobId;
  const inProgress = status !== undefined && !isTerminal(status);

  // Job details (stage, progress, failure reason) come from GET /projects/jobs/:jobId.
  // Poll while processing; when the job finishes, refresh the project so the page flips to ready/failed.
  useEffect(() => {
    if (!jobId || status === 'ready') { setJob(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await fetchApi<ProcessingJob>(`/projects/jobs/${jobId}`);
        if (cancelled) return;
        setJob(next);
        if (inProgress && isTerminal(next.status)) void refresh();
      } catch {
        // Job details are supplementary; the project record stays the source of truth.
      }
    };
    void poll();
    if (!inProgress) return () => { cancelled = true; };
    const timer = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [jobId, status, inProgress, refresh]);

  useEffect(() => {
    if (status !== 'ready') return;
    fetchApi<AIGeneration | null>(`/ai/projects/${id}/overview`).then((saved) => { setOverview(saved); setOverviewText(saved?.content || ''); }).catch(() => undefined);
  }, [id, status]);

  const generateOverview = async () => {
    setOverviewLoading(true); setOverviewError(null); setOverviewText('');
    try {
      const response = await fetch(`/api/ai/projects/${id}/overview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error?.message || 'Unable to generate an overview.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let content = ''; let generationId = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() || ''; for (const event of events) { if (!event.startsWith('data: ')) continue; const eventData = JSON.parse(event.slice(6)); if (eventData.chunk) { content += eventData.chunk; setOverviewText(content); } if (eventData.done) generationId = eventData.generationId; if (eventData.error) throw new Error(eventData.error.message); } }
      if (generationId) setOverview({ _id: generationId, projectId: id, type: 'overview', title: 'Project overview', content, model: '', status: 'completed', createdAt: new Date().toISOString() });
    } catch (error) { setOverviewError((error as Error).message); } finally { setOverviewLoading(false); }
  };

  const retry = async () => {
    if (!jobId) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const queued = await fetchApi<ProcessingJob>(`/projects/jobs/${jobId}/retry`, { method: 'POST' });
      setJob(queued);
      await refresh();
    } catch (err) {
      setRetryError((err as Error).message);
    } finally {
      setRetrying(false);
    }
  };

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
        <StatePanel tone="warning" title="Session expired" actions={<Link href={`/login?next=${encodeURIComponent(`/workspace/projects/${id}`)}`}><Button>Sign in</Button></Link>}>
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

  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <Link href="/workspace" className="inline-flex items-center text-xs text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft size={13} className="mr-1.5" />All projects
      </Link>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Project workspace</p>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold text-white truncate">{project.name}</h1>
          <Badge variant={statusVariant(project.processingStatus)}>{project.processingStatus}</Badge>
        </div>
        <p className="text-zinc-400 mt-2">{project.description || 'Uploaded source project'}</p>
      </div>

      {project.processingStatus === 'ready' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-[#30363d] p-4">Files<br /><strong className="text-white">{project.fileCount}</strong></div>
            <div className="rounded-lg border border-[#30363d] p-4">Available to AI<br /><strong className="text-white">{project.analyzableFileCount}</strong></div>
            <div className="rounded-lg border border-[#30363d] p-4">Primary language<br /><strong className="text-white">{project.mainLanguage || '—'}</strong></div>
          </div>

          {(project.languages.length > 0 || project.frameworks.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {project.languages.map((language) => <Badge key={`lang-${language}`} variant="info">{language}</Badge>)}
              {project.frameworks.map((framework) => <Badge key={`fw-${framework}`} variant="success">{framework}</Badge>)}
            </div>
          )}

          {project.scanLimits?.reached && (
            <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
              This project was indexed within configured limits: {project.scanLimits.analyzedFileCount} of {project.scanLimits.scannedFileCount} discovered files are available to AI. ({project.scanLimits.reasons.join(', ')})
            </div>
          )}

          <Link href={`/workspace/projects/${id}/explorer`}>
            <Button><Code2 size={16} className="mr-1.5" />Open Code Explorer</Button>
          </Link>

          <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-white">AI Project Overview</h2><p className="mt-1 text-xs text-zinc-400">A persisted, bounded summary of the indexed project structure.</p></div><Button size="sm" disabled={overviewLoading} onClick={() => void generateOverview()}>{overviewLoading ? <Spinner size={14} /> : <><Sparkles size={14} className="mr-1.5" />{overview ? 'Regenerate' : 'Generate overview'}</>}</Button></div>
            {overviewError && <p role="alert" className="text-xs text-red-300">{overviewError}</p>}
            {overviewText && <MarkdownResponse content={overviewText} />}
          </section>
        </>
      )}

      {project.processingStatus === 'failed' && (
        <div role="alert" className="rounded-lg border border-red-800 bg-red-950/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-300"><AlertTriangle size={16} />Processing failed</div>
          <p className="text-sm text-zinc-300">This project couldn&apos;t be indexed, so its files aren&apos;t available yet.</p>
          {job?.error && <pre className="text-xs font-mono text-red-300 bg-[#0d1117] border border-[#30363d] rounded-md p-3 whitespace-pre-wrap break-words">{job.error}</pre>}
          {retryError && <p className="text-xs text-red-400">{retryError}</p>}
          {!jobId && <p className="text-xs text-zinc-400">No processing job is linked to this project. Upload the ZIP again from the Projects page.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {jobId && (
              <Button onClick={retry} disabled={retrying}>
                {retrying ? <Spinner size={14} /> : <><RotateCcw size={14} className="mr-1.5" />Retry processing</>}
              </Button>
            )}
            {backToProjects}
          </div>
        </div>
      )}

      {project.processingStatus === 'cancelled' && (
        <div role="status" className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 space-y-3">
          <p className="text-sm text-zinc-300">Processing for this project was cancelled, so its files aren&apos;t available.</p>
          {backToProjects}
        </div>
      )}

      {inProgress && (
        <div role="status" className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-zinc-200"><Spinner size={16} />{job?.stage ?? `Processing (${project.processingStatus})`}</span>
            <span className="font-mono text-xs text-zinc-500">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#0d1117] overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-zinc-500">This page updates automatically. The Code Explorer becomes available once processing completes.</p>
        </div>
      )}
    </div>
  );
}
