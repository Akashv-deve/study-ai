import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { config, trustedAuthProxies } from './config';
import type { Db } from 'mongodb';

// Better Auth's instance carries the literal configuration in its generic type.
// It is intentionally kept opaque outside this module.
type AuthInstance = any;
let authInstance: AuthInstance | null = null;

export function initializeAuth(database: Db): AuthInstance {
  if (authInstance) return authInstance;
  if (!config.BETTER_AUTH_SECRET || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    throw new Error('Better Auth requires BETTER_AUTH_SECRET, GITHUB_CLIENT_ID, and GITHUB_CLIENT_SECRET');
  }

  authInstance = betterAuth({
    database: mongodbAdapter(database),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL || config.FRONTEND_URL,
    trustedOrigins: [config.FRONTEND_URL],
    advanced: trustedAuthProxies.length ? { ipAddress: { trustedProxies: trustedAuthProxies } } : undefined,
    socialProviders: {
      github: {
        clientId: config.GITHUB_CLIENT_ID,
        clientSecret: config.GITHUB_CLIENT_SECRET,
      },
    },
  });
  return authInstance!;
}

export function getAuth(): AuthInstance {
  if (!authInstance) throw new Error('Authentication service is not initialized');
  return authInstance;
}
