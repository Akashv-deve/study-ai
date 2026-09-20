'use client';
import React from 'react';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopBar } from '../../components/layout/TopBar';
import { AuthGuard } from '../../components/auth/AuthGuard';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard><div className="flex h-screen w-screen overflow-hidden bg-[#0d1117]">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto bg-[#0d1117]">{children}</main>
      </div>
    </div></AuthGuard>
  );
}
