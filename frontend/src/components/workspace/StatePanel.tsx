'use client';
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Spinner } from '../ui/Spinner';

type Tone = 'loading' | 'error' | 'warning' | 'info';

interface StatePanelProps {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

const badgeStyles: Record<Tone, string> = {
  loading: 'bg-blue-600/10 text-blue-400',
  error: 'bg-red-500/10 text-red-400',
  warning: 'bg-yellow-500/10 text-yellow-400',
  info: 'bg-blue-600/10 text-blue-400',
};

/** Centered card for loading / error / notice states inside the workspace shell. */
export const StatePanel: React.FC<StatePanelProps> = ({ tone, title, children, actions }) => (
  <div className="h-full min-h-[24rem] flex items-center justify-center p-8">
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="max-w-md w-full text-center space-y-4 bg-[#161b22] border border-[#30363d] rounded-2xl p-8"
    >
      <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${badgeStyles[tone]}`}>
        {tone === 'loading' ? <Spinner size={24} /> : tone === 'info' ? <Info size={22} /> : <AlertTriangle size={22} />}
      </div>
      <h2 className="text-base font-bold text-white">{title}</h2>
      {children && <div className="text-xs text-zinc-400 space-y-2">{children}</div>}
      {actions && <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{actions}</div>}
    </div>
  </div>
);
