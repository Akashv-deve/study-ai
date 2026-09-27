'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Code2, Braces, FileCode, Database, Coffee, Terminal, Layers, Palette, FileJson } from 'lucide-react';
import { fetchApi } from '../../../services/api';
import { ProgressSummary, PracticeTechnology } from '../../../types';
import { Card } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';

const TECHNOLOGIES: { id: PracticeTechnology; label: string; icon: React.ElementType }[] = [
  { id: 'html', label: 'HTML', icon: FileCode },
  { id: 'css', label: 'CSS', icon: Palette },
  { id: 'javascript', label: 'JavaScript', icon: Braces },
  { id: 'react', label: 'React', icon: Layers },
  { id: 'nodejs', label: 'Node.js', icon: Terminal },
  { id: 'express', label: 'Express.js', icon: Code2 },
  { id: 'mongodb', label: 'MongoDB', icon: Database },
  { id: 'java', label: 'Java', icon: Coffee },
  { id: 'python', label: 'Python', icon: FileJson },
];

const MODES = [
  { id: 'learn', label: 'Learn', description: 'Guided challenges that introduce a concept.' },
  { id: 'practice', label: 'Practice', description: 'Standard challenges to build fluency.' },
  { id: 'interview', label: 'Interview Me', description: 'Interview-style questions for this technology.' },
  { id: 'build', label: 'Build Something', description: 'A small feature to build end-to-end.' },
  { id: 'debug', label: 'Debug Something', description: 'Find and fix a bug in given code.' },
];

export default function PracticeLabHome() {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [mode, setMode] = useState('practice');

  useEffect(() => { fetchApi<ProgressSummary>('/practice/progress').then(setProgress).catch(() => setProgress(null)); }, []);

  const progressFor = (tech: string) => progress?.byTechnology.find((t) => t.technology === tech);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Practice Lab</h1>
        <p className="text-sm text-zinc-400 mt-1">Pick a technology and a mode to start a challenge.</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Mode</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.description}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${mode === m.id ? 'bg-blue-600 border-blue-500 text-white' : 'border-[#30363d] text-zinc-300 hover:bg-[#161b22]'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Technology</p>
        {!progress && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3"><Spinner size={14} />Loading progress…</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TECHNOLOGIES.map(({ id, label, icon: Icon }) => {
            const p = progressFor(id);
            return (
              <Link key={id} href={`/workspace/practice/${id}?mode=${mode}`}>
                <Card className="hover:border-blue-700 transition-colors h-full">
                  <div className="flex items-center gap-3">
                    <Icon size={20} className="text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{label}</p>
                      <p className="text-xs text-zinc-500">{p ? `${p.solved}/${p.attempted} solved` : 'Not started'}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
