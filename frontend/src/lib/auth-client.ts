'use client';
import { createAuthClient } from 'better-auth/react';

// Requests remain same-origin; Next.js forwards /api/auth to the Express service.
export const authClient = createAuthClient({
  // Better Auth validates this value while Next prerenders client components.
  // In the browser it still resolves to the current origin and is proxied by Next.
  baseURL: typeof window === 'undefined' ? 'http://localhost:3000/api/auth' : `${window.location.origin}/api/auth`,
});
