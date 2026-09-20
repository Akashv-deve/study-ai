'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { Spinner } from '../ui/Spinner';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isPending && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isPending, pathname, router, session]);
  if (isPending || !session) return <div className="min-h-screen grid place-items-center bg-[#0d1117]"><Spinner size={28} /></div>;
  return <>{children}</>;
}
