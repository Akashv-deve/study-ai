'use client';
import React from 'react';
import { ProjectFile } from '../../types';
import { FileCode, Folder, ChevronRight, ChevronDown } from 'lucide-react';

interface FileTreeProps {
  files: ProjectFile[];
  activePath?: string;
  onSelectFile: (file: ProjectFile) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ files, activePath, onSelectFile }) => {
  return (
    <div className="py-2 text-sm font-mono select-none overflow-y-auto h-full">
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
            <span className="truncate">{file.path}</span>
          </div>
        );
      })}
    </div>
  );
};
