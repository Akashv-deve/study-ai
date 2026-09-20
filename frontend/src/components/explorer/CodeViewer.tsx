'use client';
import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { ProjectFile } from '../../types';
import { Expand, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface CodeViewerProps {
  file: ProjectFile | null;
  content: string;
  onAskAI?: (prompt: string) => void;
  onSelectionChange?: (selection: { code: string; startLine: number; endLine: number } | null) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ file, content, onAskAI, onSelectionChange }) => {
  const [full, setFull] = useState(false);
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm font-mono">
        Select a file from the explorer tree to view its source code.
      </div>
    );
  }

  const getLanguageExt = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'python': return [python()];
      default: return [javascript({ jsx: true, typescript: true })];
    }
  };

  return (
    <div className={`${full ? 'fixed inset-0 z-50' : 'h-full'} flex flex-col bg-[#0d1117]`}>
      <div className="h-10 border-b border-[#30363d] px-4 flex items-center justify-between bg-[#161b22] text-xs font-mono">
        <span className="text-zinc-300 font-medium truncate">{file.path}</span>
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="ghost" title="Full screen" onClick={() => setFull(!full)}>{full ? <X size={14} /> : <Expand size={14} />}</Button>
          {onAskAI && (
            <Button size="sm" variant="secondary" onClick={() => onAskAI(`Explain file ${file.path}`)}>
              <Sparkles size={13} className="mr-1.5 text-blue-400" />
              Explain File
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto text-sm font-mono">
        <CodeMirror
          value={content}
          height="100%"
          theme={oneDark}
          extensions={getLanguageExt(file.language)}
          readOnly
          onUpdate={(update) => {
            if (!update.selectionSet || !onSelectionChange) return;
            const { from, to } = update.state.selection.main;
            if (from === to) return onSelectionChange(null);
            const doc = update.state.doc;
            onSelectionChange({ code: doc.sliceString(from, to).slice(0, 12_000), startLine: doc.lineAt(from).number, endLine: doc.lineAt(to).number });
          }}
        />
      </div>
    </div>
  );
};
