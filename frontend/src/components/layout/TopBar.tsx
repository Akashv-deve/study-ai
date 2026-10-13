'use client';
import React, { useEffect, useState } from 'react';
import { Sparkles, Terminal, Menu } from 'lucide-react';
import { fetchApi } from '../../services/api';

interface TopBarProps {
  /** Opens the mobile navigation drawer (button is only visible below the md breakpoint). */
  onMenuClick?: () => void;
  menuOpen?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick, menuOpen = false }) => {
  const [health, setHealth] = useState<{ status: string; services?: { ai?: string; database?: string } } | null>(null);

  useEffect(() => {
    fetchApi<{ status: string; services?: { ai?: string; database?: string } }>('/health')
      .then(setHealth)
      .catch(() => setHealth({ status: 'offline' }));
  }, []);

  const aiReady = health?.services?.ai === 'configured';

  return (
    <header className="h-14 shrink-0 bg-[#0d1117] border-b border-[#30363d] px-2 sm:px-6 flex items-center justify-between gap-2 select-none">
      <div className="flex items-center gap-1 sm:gap-3 text-sm text-zinc-400 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
          className="md:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-300 hover:bg-[#161b22] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <Terminal size={16} className="hidden sm:block text-zinc-500" aria-hidden="true" />
        <span className="truncate">Workspace</span>
      </div>

      <div className="flex items-center min-w-0">
        <div className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-[#30363d] bg-[#161b22] min-w-0">
          <Sparkles size={13} className={`shrink-0 ${aiReady ? 'text-green-400' : 'text-yellow-400'}`} aria-hidden="true" />
          <span className="text-zinc-300 truncate">{aiReady ? 'Gemini Ready' : 'AI Offline (No API Key)'}</span>
        </div>
      </div>
    </header>
  );
};
