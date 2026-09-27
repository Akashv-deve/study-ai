'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, Sparkles } from 'lucide-react';
import { fetchApi, ApiError } from '../../../services/api';
import { InterviewSession, Project } from '../../../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';

const TECHNOLOGIES = ['html', 'css', 'javascript', 'react', 'nodejs', 'express', 'mongodb', 'java', 'python'];

export default function InterviewCoachHome() {
  const router = useRouter();
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [technology, setTechnology] = useState('javascript');
  const [projectId, setProjectId] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<InterviewSession[]>('/interview').then(setSessions).catch(() => setSessions([]));
    fetchApi<Project[]>('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const body = projectId ? { projectId } : { technology };
      const session = await fetchApi<InterviewSession>('/interview', { method: 'POST', body: JSON.stringify(body) });
      router.push(`/workspace/interview/${session._id}`);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : 'Could not start the interview.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Interview Coach</h1>
        <p className="text-sm text-zinc-400 mt-1">A progressive technical interview with follow-up questions and a final report.</p>
      </div>

      <Card className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">General technology interview</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={technology} onChange={(e) => { setTechnology(e.target.value); setProjectId(''); }} className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-sm text-zinc-200">
              {TECHNOLOGIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {!!projects?.length && (
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Or interview me about one of my projects</p>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-sm text-zinc-200">
              <option value="">— None —</option>
              {projects.filter((p) => p.processingStatus === 'ready').map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {startError && <p className="text-xs text-red-400">{startError}</p>}
        <Button onClick={start} disabled={starting}>
          {starting ? <Spinner size={14} /> : <><Sparkles size={14} className="mr-1.5" />Start Interview</>}
        </Button>
      </Card>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Past sessions</p>
        {!sessions && <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner size={14} />Loading…</div>}
        {sessions?.length === 0 && <p className="text-sm text-zinc-500">No interview sessions yet.</p>}
        <div className="space-y-2">
          {sessions?.map((s) => (
            <Link key={s._id} href={`/workspace/interview/${s._id}`}>
              <Card className="hover:border-blue-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="text-zinc-500" />
                    <p className="text-sm text-zinc-200">{s.technology || 'Project interview'}</p>
                  </div>
                  <Badge variant={s.status === 'completed' ? 'success' : 'info'}>{s.status}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
