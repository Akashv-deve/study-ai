'use client';
import React, { useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';
import { ContextualChat } from './ContextualChat';
import { Button } from '../ui/Button';

interface AIPanelProps {
  onGenerate: (prompt: string) => void;
  streamOutput: string;
  isStreaming: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({ onGenerate, streamOutput, isStreaming }) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(streamOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-l border-[#30363d] p-4 font-sans select-none overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b border-[#30363d]">
        <div className="flex items-center space-x-2">
          <Sparkles size={16} className="text-blue-400" />
          <h3 className="font-semibold text-sm text-white">Study AI Assistant</h3>
        </div>
      </div>

      <div className="flex-1 my-4 space-y-4">
        {streamOutput ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 font-mono text-xs whitespace-pre-wrap text-zinc-200 leading-relaxed relative">
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </Button>
            </div>
            {streamOutput}
          </div>
        ) : (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Ask a question or select code to generate explanations, traces, or code updates.
          </div>
        )}

        {streamOutput && (
          <ContextualChat
            isLoading={isStreaming}
            onSend={(msg) => onGenerate(msg)}
          />
        )}
      </div>
    </div>
  );
};
