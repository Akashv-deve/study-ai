import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after requireAuth, so the budget belongs to the signed-in user, not to whatever address a proxy presents
  // (behind Vercel -> Render every visitor can share one address). Falls back to the IP if no user is attached.
  keyGenerator: (req) => (req as { user?: { id?: string } }).user?.id ?? req.ip ?? 'unknown',
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many AI generation requests' } },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many file uploads' } },
});
