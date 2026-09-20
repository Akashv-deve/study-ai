'use client';
import React, { useEffect, useState } from 'react';
import { Sparkles, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchApi } from '../../services/api';

export const TopBar: React.FC = () => {
  const [health, setHealth] = useState<{ status: string; services?: { ai?: string; database?: string } } | null>(null);

  useEffect(() => {
    fetchApi<{ status: string; services?: { ai?: string; database?: string } }>('/health')
      .then(setHealth)
      .catch(() => setHealth({ status: 'offline' }));
  }, []);

  const aiReady = health?.services?.ai === 'configured';

  return (
    <header className="h-14 bg-[#0d1117] border-b border-[#30363d] px-6 flex items-center justify-between select-none">
      <div className="flex items-center space-x-3 text-sm text-zinc-400">
        <Terminal size={16} className="text-zinc-500" />
        <span>Workspace</span>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-xs px-2.5 py-1 rounded-full border border-[#30363d] bg-[#161b22]">
          <Sparkles size={13} className={aiReady ? 'text-green-400' : 'text-yellow-400'} />
          <span className="text-zinc-300">{aiReady ? 'Gemini Ready' : 'AI Offline (No API Key)'}</span>
        </div>
      </div>
    </header>
  );
};
