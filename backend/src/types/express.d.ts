export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: unknown;
    }
  }
}
