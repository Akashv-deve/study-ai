'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FolderGit2, Upload, FileCode, Trash2 } from 'lucide-react';
import { fetchApi, uploadZipFile } from '../../services/api';
import { ProcessingJob, Project } from '../../types';
import { useAppStore } from '../../state/store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [activeJob, setActiveJob] = useState<ProcessingJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);

  const loadProjects = async () => {
    try {
      const data = await fetchApi<Project[]>('/projects');
      setProjects(data);
      const processing = data.find((project) => project.processingJobId && !['ready', 'failed', 'cancelled'].includes(project.processingStatus));
      if (processing?.processingJobId) {
        const job = await fetchApi<ProcessingJob>(`/projects/jobs/${processing.processingJobId}`);
        setActiveJob(job);
      }
    } catch (err) {
      setProjects([]);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!activeJob || ['ready', 'failed', 'cancelled'].includes(activeJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await fetchApi<ProcessingJob>(`/projects/jobs/${activeJob.jobId}`);
        setActiveJob(job);
        if (job.status === 'ready') { await loadProjects(); }
      } catch (err) { setError((err as Error).message); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeJob]);

  const selectArchive = (candidate?: File) => {
    setError(null);
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.zip') || candidate.size > 100 * 1024 * 1024) {
      setError('Choose a ZIP archive no larger than 100 MB.'); return;
    }
    setFile(candidate);
    if (!projectName) setProjectName(candidate.name.replace(/\.zip$/i, ''));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !projectName.trim()) return;

    setUploading(true);
    try {
      const created = await uploadZipFile(file, projectName.trim());
      setActiveJob({ jobId: created.jobId, projectId: created.projectId, status: created.status, stage: 'Queued for processing', progress: 0 });
      setModalOpen(false);
      setFile(null);
      setProjectName('');
      loadProjects();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const retry = async () => {
    if (!activeJob) return;
    try {
      const job = await fetchApi<ProcessingJob>(`/projects/jobs/${activeJob.jobId}/retry`, { method: 'POST' });
      setActiveJob(job); setError(null);
    } catch (err) { setError((err as Error).message); }
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Delete “${project.name}” and all of its indexed files and AI data? This cannot be undone.`)) return;
    try {
      await fetchApi(`/projects/${project._id}`, { method: 'DELETE' });
      setProjects((items) => items.filter((item) => item._id !== project._id));
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 select-none">
      <div className="flex items-center justify-between border-b border-[#30363d] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Study Workspaces</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage your analyzed software projects, uploaded ZIP archives, and imported codebases.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} className="mr-1.5" />
          New Workspace
        </Button>
      </div>

      {error && <div role="alert" className="border border-red-800 bg-red-950/40 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {activeJob && <div className="border border-[#30363d] bg-[#161b22] rounded-lg px-4 py-3 text-sm flex items-center justify-between"><div><span className="text-zinc-200">{activeJob.stage}</span><span className="ml-2 text-zinc-500">{activeJob.progress}%</span>{activeJob.error && <span className="block text-red-400 text-xs mt-1">{activeJob.error}</span>}</div>{activeJob.status === 'failed' && <Button size="sm" onClick={retry}>Retry</Button>}{activeJob.status === 'ready' && <span className="text-green-400 text-xs">Project ready</span>}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-[#30363d] rounded-2xl p-12 text-center space-y-4 max-w-md mx-auto my-12 bg-[#161b22]/50">
          <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto">
            <FolderGit2 size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base text-white">No projects yet.</h3>
            <p className="text-xs text-zinc-400">
              Start your first study workspace. Upload a project ZIP archive to begin.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Upload size={14} className="mr-1.5" />
            Upload Project ZIP
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((proj) => (
            <div key={proj._id} className="relative">
            <Link
              href={`/workspace/projects/${proj._id}`}
              onClick={() => setCurrentProject(proj)}
              className="block bg-[#161b22] border border-[#30363d] hover:border-zinc-500 rounded-xl p-5 transition-all group shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                  {proj.name}
                </div>
                <Badge variant={proj.processingStatus === 'ready' ? 'success' : 'warning'}>
                  {proj.processingStatus}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-2 my-3 min-h-[32px]">
                {proj.description || 'Uploaded project codebase.'}
              </p>
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-3 border-t border-[#30363d]/60">
                <span className="flex items-center">
                  <FileCode size={13} className="mr-1" />
                  {proj.fileCount || 0} files
                </span>
                <span>{proj.mainLanguage || 'Source'}</span>
              </div>
            </Link>
            <button type="button" aria-label={`Delete ${proj.name}`} onClick={() => void deleteProject(proj)} className="absolute right-3 top-3 rounded p-1.5 text-zinc-500 hover:bg-red-950 hover:text-red-300" title="Delete project"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Upload Project ZIP">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Project Name</label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. My Web App"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); selectArchive(event.dataTransfer.files[0]); }}
            className={`rounded-md border border-dashed p-3 transition-colors ${dragging ? 'border-blue-400 bg-blue-500/10' : 'border-[#30363d]'}`}
          >
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Project Archive (.zip)</label>
            <input
              type="file"
              accept=".zip"
              required
              onChange={(e) => {
                selectArchive(e.target.files?.[0]);
              }}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs text-zinc-300 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-200"
            />
            <p className="mt-2 text-[11px] text-zinc-500">Drop a ZIP here or choose one (maximum 100 MB).</p>
          </div>

          <div className="pt-3 flex justify-end space-x-2">
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? <Spinner size={14} /> : 'Upload & Process'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
