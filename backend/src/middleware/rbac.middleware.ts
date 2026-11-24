import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, UserRole } from './auth.middleware';
import { ProblemError } from '../errors/problemDetails';

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const role = req.user?.role ?? 'PUBLIC';
    if (!allowedRoles.includes(role)) {
      next(
        new ProblemError({
          status: 403,
          title: 'Forbidden',
          detail: `Role '${role}' is not permitted to perform this action. Required: ${allowedRoles.join(', ')}.`,
        })
      );
      return;
    }
    next();
  };
}

/**
 * Enforces cross-brand isolation (FR8 & QA3).
 * BRAND_USER may ONLY access resources matching their own brandId.
 */
export function assertBrandAccess(user: AuthenticatedRequest['user'], resourceBrandId: string | null | undefined): void {
  if (!user) {
    throw new ProblemError({
      status: 401,
      title: 'Unauthorized',
      detail: 'User context missing.',
    });
  }
  if (user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN') {
    return;
  }
  if (user.role === 'BRAND_USER') {
    if (!resourceBrandId || resourceBrandId !== user.brandId) {
      throw new ProblemError({
        status: 403,
        title: 'Cross-Brand Access Refused',
        detail: 'Your brand account is not authorized to view or modify another brand’s supply-chain records.',
        type: 'https://threadtrace.local/errors/cross-brand-forbidden',
      });
    }
    return;
  }
  throw new ProblemError({
    status: 403,
    title: 'Forbidden',
    detail: 'Public users may only access public Digital Product Passport endpoints.',
  });
}
