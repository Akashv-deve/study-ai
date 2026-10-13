'use client';
import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';

interface ContextualChatProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export const ContextualChat: React.FC<ContextualChatProps> = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="border-t border-[#30363d] p-4 bg-[#161b22] mt-4 rounded-b-lg">
      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
        <Sparkles size={13} className="text-blue-400" />
        <span>Ask follow-up question about this result</span>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <label htmlFor="ai-followup-input" className="sr-only">Follow-up question</label>
        <input
          id="ai-followup-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Why did you use this approach?"
          className="min-w-0 flex-1 min-h-[44px] bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm sm:text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          disabled={isLoading}
        />
        <Button size="sm" type="submit" disabled={isLoading || !input.trim()} className="shrink-0" aria-label="Send follow-up question">
          <Send size={13} aria-hidden="true" className="sm:mr-1" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </div>
  );
};
