'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, MessageSquare, FolderGit2, Star, TrendingUp } from 'lucide-react';
import { fetchApi } from '../../../services/api';
import { ProgressSummary, Project } from '../../../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';

export default function Dashboard() {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    fetchApi<ProgressSummary>('/practice/progress').then(setProgress).catch(() => setProgress(null));
    fetchApi<Project[]>('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const continueChallenge = progress?.recentActivity.find((a) => a.status === 'in_progress') ?? progress?.recentActivity[0];

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/workspace/practice">
          <Card className="hover:border-blue-700 transition-colors h-full">
            <div className="flex items-center gap-2 mb-2"><GraduationCap size={16} className="text-blue-400" /><p className="text-sm font-semibold text-white">Practice Lab</p></div>
            {progress ? (
              <p className="text-xs text-zinc-400">{progress.totals.challengesSolved} of {progress.totals.challengesAttempted} challenges solved</p>
            ) : <Spinner size={12} />}
          </Card>
        </Link>
        <Link href="/workspace/interview">
          <Card className="hover:border-blue-700 transition-colors h-full">
            <div className="flex items-center gap-2 mb-2"><MessageSquare size={16} className="text-blue-400" /><p className="text-sm font-semibold text-white">Interview Coach</p></div>
            {progress ? <p className="text-xs text-zinc-400">{progress.totals.interviewSessions} sessions completed</p> : <Spinner size={12} />}
          </Card>
        </Link>
        <Link href="/workspace">
          <Card className="hover:border-blue-700 transition-colors h-full">
            <div className="flex items-center gap-2 mb-2"><FolderGit2 size={16} className="text-blue-400" /><p className="text-sm font-semibold text-white">Projects</p></div>
            {projects ? <p className="text-xs text-zinc-400">{projects.length} project{projects.length === 1 ? '' : 's'}</p> : <Spinner size={12} />}
          </Card>
        </Link>
        <Link href="/workspace/favorites">
          <Card className="hover:border-blue-700 transition-colors h-full">
            <div className="flex items-center gap-2 mb-2"><Star size={16} className="text-blue-400" /><p className="text-sm font-semibold text-white">Favorites</p></div>
            <p className="text-xs text-zinc-400">Saved AI responses</p>
          </Card>
        </Link>
      </div>

      {continueChallenge && (
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Continue practicing</p>
          <Link href={`/workspace/practice/challenge/${continueChallenge.challengeId}`}>
            <Card className="hover:border-blue-700 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-200">{continueChallenge.title} <span className="text-zinc-500 capitalize">· {continueChallenge.technology}</span></p>
                <Badge variant={continueChallenge.status === 'passed' ? 'success' : 'info'}>{continueChallenge.status}</Badge>
              </div>
            </Card>
          </Link>
        </div>
      )}

      {!!progress?.weakTopics.length && (
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5"><TrendingUp size={13} />Weak topics</p>
          <div className="flex flex-wrap gap-1.5">{progress.weakTopics.map((t) => <Badge key={t} variant="warning">{t}</Badge>)}</div>
        </div>
      )}

      {!!progress?.recentActivity.length && (
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent activity</p>
          <div className="space-y-1.5">
            {progress.recentActivity.slice(0, 5).map((a, i) => (
              <Link key={i} href={`/workspace/practice/challenge/${a.challengeId}`}>
                <Card className="hover:border-blue-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-200 truncate">{a.title} <span className="text-zinc-500 capitalize">· {a.technology}</span></p>
                    <Badge variant={a.status === 'passed' ? 'success' : a.status === 'failed' ? 'error' : 'info'}>{a.status}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
