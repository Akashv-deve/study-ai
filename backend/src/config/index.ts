import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('3001').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  // This is the public browser origin, not the private Render service URL.
  // Better Auth appends its /api/auth base path automatically.
  BETTER_AUTH_URL: z.string().url().optional(),
  // Comma-separated trusted proxy IPs/CIDRs. Never use a broad client range.
  BETTER_AUTH_TRUSTED_PROXIES: z.string().default(''),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  ENCRYPTION_KEY: z.string().length(64).optional(),
  MAX_UPLOAD_BYTES: z.string().default('104857600').transform((val) => parseInt(val, 10)),
  MAX_SCANNED_FILES: z.string().default('10000').transform((val) => parseInt(val, 10)),
  MAX_ANALYZED_FILES: z.string().default('2000').transform((val) => parseInt(val, 10)),
  MAX_RECURSION_DEPTH: z.string().default('20').transform((val) => parseInt(val, 10)),
  MAX_READABLE_FILE_SIZE: z.string().default('524288').transform((val) => parseInt(val, 10)),
  MAX_TOTAL_READABLE_BYTES: z.string().default('52428800').transform((val) => parseInt(val, 10)),
  MAX_ZIP_ENTRY_BYTES: z.string().default('10485760').transform((val) => parseInt(val, 10)),
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES: z.string().default('314572800').transform((val) => parseInt(val, 10)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
}

export const config = parsed.success ? parsed.data : envSchema.parse({});

export const trustedAuthProxies = config.BETTER_AUTH_TRUSTED_PROXIES.split(',').map((entry) => entry.trim()).filter(Boolean);

export function assertRuntimeConfiguration(): void {
  const required = ['MONGODB_URI', 'BETTER_AUTH_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'] as const;
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}
