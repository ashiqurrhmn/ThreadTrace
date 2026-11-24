import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ProblemError } from '../errors/problemDetails';

export type UserRole = 'PUBLIC' | 'BRAND_USER' | 'FACTORY_ADMIN' | 'AUDITOR';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  brandId: string | null;
  brandCode?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  traceId?: string;
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: '24h' });
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = {
      id: 'public-anonymous',
      email: 'public@threadtrace.local',
      name: 'Public Consumer',
      role: 'PUBLIC',
      brandId: null,
      brandCode: null,
    };
    next();
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    next(
      new ProblemError({
        status: 401,
        title: 'Invalid or Expired Token',
        detail: 'Authentication token is invalid or has expired. Please sign in again.',
      })
    );
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  optionalAuth(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.user || req.user.role === 'PUBLIC') {
      next(
        new ProblemError({
          status: 401,
          title: 'Authentication Required',
          detail: 'A valid Bearer token is required to access this endpoint.',
        })
      );
      return;
    }
    next();
  });
}
