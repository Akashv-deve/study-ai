'use client';
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderGit2, Code2, Heart, Layers, LogOut, LayoutDashboard, GraduationCap, MessageSquare, TrendingUp, X } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { authClient } from '../../lib/auth-client';

interface SidebarProps {
  /** Mobile drawer state. On md+ screens the sidebar is always visible and this is ignored. */
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open = false, onClose }) => {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close the drawer whenever the route changes (a nav link was followed).
  useEffect(() => { onClose?.(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // While the mobile drawer is open: Escape closes it and focus moves inside it.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    { label: 'Dashboard', href: '/workspace/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/workspace', icon: FolderGit2 },
    { label: 'Practice Lab', href: '/workspace/practice', icon: GraduationCap },
    { label: 'Interview Coach', href: '/workspace/interview', icon: MessageSquare },
    { label: 'Progress', href: '/workspace/progress', icon: TrendingUp },
    { label: 'Favourites', href: '/workspace/favorites', icon: Heart },
  ];
  const isActive = (href: string) => (href === '/workspace' ? pathname === href : pathname.startsWith(href));

  const projectNav = currentProject
    ? [
        { label: 'Overview', href: `/workspace/projects/${currentProject._id}`, icon: Layers },
        { label: 'Code Explorer', href: `/workspace/projects/${currentProject._id}/explorer`, icon: Code2 },
      ]
    : [];

  const linkClass = (active: boolean) => `flex items-center gap-2.5 px-3 min-h-[44px] md:min-h-0 md:py-2 rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
    active ? 'bg-blue-600/10 text-blue-400 font-medium' : 'text-zinc-400 hover:text-white hover:bg-[#161b22]'
  }`;

  return (
    <>
      {/* Backdrop: only exists while the mobile drawer is open; blocks interaction with the page behind it. */}
      {open && <div className="md:hidden fixed inset-0 z-30 bg-black/60" aria-hidden="true" onClick={onClose} />}
    <aside
      id="app-sidebar"
      aria-label="Main navigation"
      className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:visible
        bg-[#0d1117] border-r border-[#30363d] flex flex-col justify-between h-full select-none overflow-y-auto
        transition-transform duration-200 ${open ? 'translate-x-0 visible' : '-translate-x-full invisible'}`}
    >
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
            S
          </div>
          <div className="min-w-0">
            <span className="font-bold text-base tracking-wide text-white">Study AI</span>
            <span className="block text-[10px] text-zinc-400 uppercase tracking-widest font-mono">Dev Assistant</span>
          </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-[#161b22] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-1">
          <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-2">Workspace</div>
          {mainNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={linkClass(active)}
              >
                <Icon size={16} aria-hidden="true" />
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
                  aria-current={active ? 'page' : undefined}
                  className={linkClass(active)}
                >
                  <Icon size={16} aria-hidden="true" />
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
        <button onClick={signOut} className="mt-2 w-full flex items-center gap-2 px-3 min-h-[44px] md:min-h-0 md:py-2 text-xs text-zinc-400 hover:bg-[#161b22] hover:text-white rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
    </>
  );
};
