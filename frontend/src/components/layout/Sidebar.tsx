'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderGit2, Code2, Heart, Layers, LogOut } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { authClient } from '../../lib/auth-client';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const currentProject = useAppStore((s) => s.currentProject);
  const resetWorkspace = useAppStore((s) => s.resetWorkspace);
  const signOut = async () => {
    await authClient.signOut();
    resetWorkspace();
    router.replace('/login');
    router.refresh();
  };

  const mainNav = [
    { label: 'Projects', href: '/workspace', icon: FolderGit2 },
    { label: 'Favourites', href: '/workspace/favorites', icon: Heart },
  ];

  const projectNav = currentProject
    ? [
        { label: 'Overview', href: `/workspace/projects/${currentProject._id}`, icon: Layers },
        { label: 'Code Explorer', href: `/workspace/projects/${currentProject._id}/explorer`, icon: Code2 },
      ]
    : [];

  return (
    <aside className="w-60 bg-[#0d1117] border-r border-[#30363d] flex flex-col justify-between h-full select-none">
      <div className="p-4 space-y-6">
        <div className="flex items-center space-x-2.5 px-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
            S
          </div>
          <div>
            <span className="font-bold text-base tracking-wide text-white">Study AI</span>
            <span className="block text-[10px] text-zinc-400 uppercase tracking-widest font-mono">Dev Assistant</span>
          </div>
        </div>

        <nav className="space-y-1">
          <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-2">Workspace</div>
          {mainNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? 'bg-blue-600/10 text-blue-400 font-medium' : 'text-zinc-400 hover:text-white hover:bg-[#161b22]'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {currentProject && (
          <nav className="space-y-1 pt-2 border-t border-[#30363d]">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-1 truncate">
              {currentProject.name}
            </div>
            {projectNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    active ? 'bg-blue-600/10 text-blue-400 font-medium' : 'text-zinc-400 hover:text-white hover:bg-[#161b22]'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <div className="p-3 border-t border-[#30363d]">
        <div className="flex items-center space-x-3 px-3 py-2 rounded-md bg-[#161b22] border border-[#30363d]">
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
            U
          </div>
          <div className="flex-1 truncate">
            <div className="text-xs font-medium text-white truncate">Developer Workspace</div>
            <div className="text-[10px] text-zinc-400">Authenticated</div>
          </div>
        </div>
        <button onClick={signOut} className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-[#161b22] hover:text-white rounded-md transition-colors">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
};
