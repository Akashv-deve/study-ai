'use client';
import React, { useState } from 'react';
import { ProjectFile } from '../../types';
import { Expand, FileCode, X } from 'lucide-react';

interface FileTreeProps {
  files: ProjectFile[];
  activePath?: string;
  onSelectFile: (file: ProjectFile) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ files, activePath, onSelectFile }) => {
  const [full, setFull] = useState(false);
  return (
    <div className={`${full ? 'fixed inset-0 z-50 bg-[#0d1117] p-4' : 'py-2'} text-sm font-mono select-none overflow-y-auto h-full`}>
      <div className="mb-2 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><span>Files</span><button type="button" title="Full screen" aria-label="Toggle file explorer full screen" onClick={() => setFull(!full)} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">{full ? <X size={14} /> : <Expand size={14} />}</button></div>
      {files.map((file) => {
        const isActive = activePath === file.path;
        return (
          <div
            key={file._id}
            onClick={() => onSelectFile(file)}
            className={`flex items-center space-x-2 px-4 py-1.5 cursor-pointer text-xs transition-colors ${
              isActive ? 'bg-blue-600/20 text-blue-400 font-medium border-l-2 border-blue-500' : 'text-zinc-400 hover:text-white hover:bg-[#161b22]'
            }`}
          >
            <FileCode size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="min-w-0" title={file.path}><span className="block truncate">{file.name}</span><span className="block truncate text-[10px] text-zinc-500">{file.directory || file.path}</span></span>
          </div>
        );
      })}
    </div>
  );
};
