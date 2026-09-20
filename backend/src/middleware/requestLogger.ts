import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// OAuth callbacks contain transient code/state values in their query string.
// Deliberately log only the pathname, never the raw request target.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.http(`${req.method} ${req.path} ${res.statusCode} - ${elapsedMs.toFixed(1)} ms`);
  });
  next();
}
