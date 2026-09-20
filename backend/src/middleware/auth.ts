import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError, ServiceUnavailableError } from '../utils/errors';
import { getAuth } from '../auth';
import { fromNodeHeaders } from 'better-auth/node';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let auth;
    try {
      auth = getAuth();
    } catch {
      throw new ServiceUnavailableError('Authentication service is unavailable');
    }
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Authentication required');
    }

    req.user = {
      id: session.user.id,
      name: session.user.name || undefined,
      email: session.user.email,
      image: session.user.image || undefined,
    };
    req.session = session.session;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwnership(getOwnerIdFromResource: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ownerId = await getOwnerIdFromResource(req);
      if (!ownerId || ownerId !== req.user.id) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
