'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../services/api';
import { ProgressSummary } from '../../../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';

export default function ProgressPage() {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);

  useEffect(() => { fetchApi<ProgressSummary>('/practice/progress').then(setProgress); }, []);

  if (!progress) return <div className="h-full flex items-center justify-center gap-2 text-sm text-zinc-500"><Spinner size={16} />Loading progress…</div>;

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold text-white">Progress</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Challenges attempted', progress.totals.challengesAttempted],
          ['Challenges solved', progress.totals.challengesSolved],
          ['Total attempts', progress.totals.totalAttempts],
          ['Interview sessions', progress.totals.interviewSessions],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <p className="text-2xl font-bold text-white">{value as number}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {!!progress.weakTopics.length && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Weak topics</p>
          <div className="flex flex-wrap gap-1.5">{progress.weakTopics.map((t) => <Badge key={t} variant="warning">{t}</Badge>)}</div>
        </Card>
      )}

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">By technology</p>
        {progress.byTechnology.length === 0 && <p className="text-sm text-zinc-500">No attempts yet — head to the Practice Lab to get started.</p>}
        <div className="space-y-2">
          {progress.byTechnology.map((t) => (
            <Card key={t.technology}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white capitalize">{t.technology}</p>
                <p className="text-xs text-zinc-400">{t.solved}/{t.attempted} solved · {t.totalAttempts} attempts · {t.hintsUsed} hints used</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Recent activity</p>
        {progress.recentActivity.length === 0 && <p className="text-sm text-zinc-500">Nothing yet.</p>}
        <div className="space-y-1.5">
          {progress.recentActivity.map((a, i) => (
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
    </div>
  );
}
