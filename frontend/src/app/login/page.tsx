'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/auth-client';

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/workspace';
  try {
    const target = new URL(value, 'https://study-ai.local');
    return target.origin === 'https://study-ai.local' ? `${target.pathname}${target.search}${target.hash}` : '/workspace';
  } catch {
    return '/workspace';
  }
}

function LoginContent() {
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  useEffect(() => { if (session) router.replace(next); }, [next, router, session]);
  const signIn = async () => {
    setError(null);
    const result = await authClient.signIn.social({ provider: 'github', callbackURL: next });
    if (result.error) setError(result.error.message || 'Unable to start GitHub sign-in.');
  };
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 max-w-md w-full space-y-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-600 mx-auto flex items-center justify-center text-white font-bold text-xl">
          S
        </div>
        <h2 className="text-2xl font-bold text-white">Sign in to Study AI</h2>
        <p className="text-sm text-zinc-400">
          Access your personal workspace, project files, and saved AI learning results.
        </p>
        <button onClick={signIn} disabled={isPending} className="block w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
          Continue with GitHub
        </button>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}><LoginContent /></Suspense>;
}
