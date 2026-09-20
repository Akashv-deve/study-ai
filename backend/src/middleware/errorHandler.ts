import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.path} - ${err.stack || err.message}`);
  } else {
    logger.warn(`${req.method} ${req.path} - ${statusCode} ${message}`);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(err instanceof AppError && (err as unknown as { details?: unknown }).details
        ? { details: (err as unknown as { details?: unknown }).details }
        : {}),
      ...(config.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}
