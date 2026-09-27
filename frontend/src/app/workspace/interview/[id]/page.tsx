'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Send, StopCircle } from 'lucide-react';
import { fetchApi, ApiError } from '../../../../services/api';
import { InterviewSession } from '../../../../types';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Spinner } from '../../../../components/ui/Spinner';

export default function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    fetchApi<InterviewSession>(`/interview/${id}`)
      .then((s) => { setSession(s); setLoading(false); })
      .catch((err) => { setError(err instanceof ApiError ? err.message : 'Could not load this interview.'); setLoading(false); });
  }, [id]);

  const submit = async () => {
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      const updated = await fetchApi<InterviewSession>(`/interview/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) });
      setSession(updated);
      setAnswer('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your answer.');
    } finally {
      setSubmitting(false);
    }
  };

  const end = async () => {
    setEnding(true);
    try {
      const updated = await fetchApi<InterviewSession>(`/interview/${id}/end`, { method: 'POST' });
      setSession(updated);
    } finally {
      setEnding(false);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center gap-2 text-sm text-zinc-500"><Spinner size={16} />Loading interview…</div>;
  if (error || !session) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-3">
        <p className="text-sm text-red-400">{error || 'Interview not found.'}</p>
        <Link href="/workspace/interview"><Button variant="secondary"><ArrowLeft size={14} className="mr-1.5" />Interview Coach</Button></Link>
      </div>
    );
  }

  const lastTurn = session.turns[session.turns.length - 1];
  const currentQuestion = lastTurn ? (lastTurn.followUps.length > 0 && !lastTurn.followUps[lastTurn.followUps.length - 1].answer
    ? lastTurn.followUps[lastTurn.followUps.length - 1].question
    : !lastTurn.answer ? lastTurn.question : null) : null;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <Link href="/workspace/interview" className="inline-flex items-center text-xs text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft size={13} className="mr-1.5" />Interview Coach
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">{session.technology || 'Project interview'}</h1>
        <Badge variant={session.status === 'completed' ? 'success' : 'info'}>{session.status}</Badge>
      </div>

      <div className="space-y-4">
        {session.turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <Card>
              <p className="text-xs text-zinc-500 mb-1 capitalize">{turn.category}</p>
              <p className="text-sm text-zinc-100">{turn.question}</p>
              {turn.answer && <p className="text-sm text-zinc-400 mt-2 border-l-2 border-[#30363d] pl-3">{turn.answer}</p>}
            </Card>
            {turn.followUps.map((fu, j) => (
              <Card key={j} className="ml-6">
                <p className="text-xs text-blue-400 mb-1">Follow-up</p>
                <p className="text-sm text-zinc-100">{fu.question}</p>
                {fu.answer && <p className="text-sm text-zinc-400 mt-2 border-l-2 border-[#30363d] pl-3">{fu.answer}</p>}
              </Card>
            ))}
          </div>
        ))}
      </div>

      {session.status === 'active' && currentQuestion && (
        <div className="space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            rows={4}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-md p-3 text-sm text-zinc-100 resize-none"
          />
          <div className="flex items-center gap-2">
            <Button onClick={submit} disabled={submitting || !answer.trim()}>
              {submitting ? <Spinner size={14} /> : <><Send size={14} className="mr-1.5" />Submit Answer</>}
            </Button>
            <Button variant="ghost" onClick={end} disabled={ending}>
              {ending ? <Spinner size={14} /> : <><StopCircle size={14} className="mr-1.5" />End Interview</>}
            </Button>
          </div>
        </div>
      )}

      {session.status === 'completed' && session.report && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-white">Final report</p>
          <p className="text-sm text-zinc-300">{session.report.summary}</p>
          {!!session.report.strengths.length && (
            <div><p className="text-xs text-green-400 font-semibold mb-1">Strengths</p><ul className="space-y-0.5">{session.report.strengths.map((s, i) => <li key={i} className="text-xs text-zinc-300">+ {s}</li>)}</ul></div>
          )}
          {!!session.report.weakAreas.length && (
            <div><p className="text-xs text-yellow-400 font-semibold mb-1">Weak areas</p><ul className="space-y-0.5">{session.report.weakAreas.map((s, i) => <li key={i} className="text-xs text-zinc-300">- {s}</li>)}</ul></div>
          )}
          {!!session.report.topicsToRevise.length && (
            <div><p className="text-xs text-blue-400 font-semibold mb-1">Topics to revise</p><ul className="space-y-0.5">{session.report.topicsToRevise.map((s, i) => <li key={i} className="text-xs text-zinc-300">• {s}</li>)}</ul></div>
          )}
        </Card>
      )}
    </div>
  );
}
