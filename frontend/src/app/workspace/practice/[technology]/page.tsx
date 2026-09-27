'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { fetchApi, ApiError } from '../../../../services/api';
import { PracticeChallenge, PracticeDifficulty } from '../../../../types';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Spinner } from '../../../../components/ui/Spinner';

const DIFFICULTIES: PracticeDifficulty[] = ['beginner', 'intermediate', 'advanced'];

export default function TechnologyChallengeList() {
  const { technology } = useParams<{ technology: string }>();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'practice';
  const router = useRouter();

  const [challenges, setChallenges] = useState<PracticeChallenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('beginner');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const load = useCallback(() => {
    setChallenges(null);
    fetchApi<PracticeChallenge[]>(`/practice/challenges?technology=${technology}&mode=${mode}`)
      .then(setChallenges)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load challenges.'));
  }, [technology, mode]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const challenge = await fetchApi<PracticeChallenge>('/practice/challenges/generate', {
        method: 'POST',
        body: JSON.stringify({ technology, mode, difficulty }),
      });
      router.push(`/workspace/practice/challenge/${challenge._id}`);
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Could not generate a challenge.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <Link href="/workspace/practice" className="inline-flex items-center text-xs text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft size={13} className="mr-1.5" />Practice Lab
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white capitalize">{technology} · {mode}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as PracticeDifficulty)} className="bg-[#161b22] border border-[#30363d] rounded-md px-2 py-1.5 text-sm text-zinc-200">
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Spinner size={14} /> : <><Sparkles size={14} className="mr-1.5" />Generate a challenge</>}
          </Button>
        </div>
      </div>
      {generateError && <p className="text-xs text-red-400">{generateError}</p>}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!challenges && !error && <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner size={14} />Loading challenges…</div>}
      {challenges && challenges.length === 0 && (
        <Card><p className="text-sm text-zinc-400">No challenges yet for {technology} · {mode}. Generate one above to get started.</p></Card>
      )}
      <div className="space-y-2">
        {challenges?.map((c) => (
          <Link key={c._id} href={`/workspace/practice/challenge/${c._id}`}>
            <Card className="hover:border-blue-700 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{c.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={c.difficulty === 'beginner' ? 'success' : c.difficulty === 'intermediate' ? 'warning' : 'error'}>{c.difficulty}</Badge>
                  <Badge variant="info">{c.topic}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
