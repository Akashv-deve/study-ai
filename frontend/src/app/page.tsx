'use client';
import React from 'react';
import Link from 'next/link';
import { Sparkles, Code2, FolderGit2, ShieldCheck, Cpu } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col justify-between">
      <header className="border-b border-[#30363d] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
            S
          </div>
          <span className="font-bold text-lg tracking-wide">Study AI</span>
        </div>
        <Link
          href="/login"
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Open Workspace
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20 text-center space-y-8">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-mono">
          <Sparkles size={14} />
          <span>Project-Aware AI Learning Assistant</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
          Understand software codebases faster with AI.
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          Sign in with GitHub, then upload project ZIPs for project-aware code exploration and AI explanations. GitHub repository import is planned for a later phase.
        </p>

        <div className="pt-4 flex justify-center space-x-4">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg text-base shadow-lg transition-colors"
          >
            Start Learning Workspace
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-16 text-left">
          <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-xl space-y-3">
            <FolderGit2 className="text-blue-400" size={24} />
            <h3 className="font-semibold text-white">Project Aware</h3>
            <p className="text-xs text-zinc-400">
              Parses directories, filters dependency bloat, indexes source files into structured memory.
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-xl space-y-3">
            <Code2 className="text-purple-400" size={24} />
            <h3 className="font-semibold text-white">Code Explorer</h3>
            <p className="text-xs text-zinc-400">
              IDE-style viewer with line selection, file explanations, and contextual AI chat.
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-xl space-y-3">
            <Cpu className="text-green-400" size={24} />
            <h3 className="font-semibold text-white">Async Background Jobs</h3>
            <p className="text-xs text-zinc-400">
              Non-blocking ZIP upload scanner with real-time stage progress polling.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#30363d] px-8 py-6 text-center text-xs text-zinc-500">
        Study AI — Production Quality AI Developer Assistant
      </footer>
    </div>
  );
}
