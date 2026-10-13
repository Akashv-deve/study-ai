'use client';
import React, { useCallback, useState } from 'react';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopBar } from '../../components/layout/TopBar';
import { AuthGuard } from '../../components/auth/AuthGuard';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  return (
    // h-[100dvh]: on phones, 100vh is taller than the visible area (URL bar), which hides bottom controls.
    <AuthGuard><div className="flex h-screen h-[100dvh] w-full overflow-hidden bg-[#0d1117]">
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <TopBar onMenuClick={() => setNavOpen(true)} menuOpen={navOpen} />
        <main className="flex-1 min-h-0 min-w-0 overflow-auto bg-[#0d1117]">{children}</main>
      </div>
    </div></AuthGuard>
  );
}
