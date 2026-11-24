import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isDbConnectionError } from '../db/pool';

export class ProblemError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly errors?: unknown;

  constructor(options: { status: number; title: string; detail: string; type?: string; errors?: unknown }) {
    super(options.detail);
    this.status = options.status;
    this.title = options.title;
    this.type = options.type ?? `https://threadtrace.local/errors/${options.status}`;
    this.errors = options.errors;
  }
}

export function problemDetailsHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const traceId = (req as Request & { traceId?: string }).traceId ?? 'unknown';

  if (err instanceof ProblemError) {
    res
      .status(err.status)
      .type('application/problem+json')
      .json({
        type: err.type,
        title: err.title,
        status: err.status,
        detail: err.message,
        instance: req.originalUrl,
        traceId,
        ...(err.errors ? { errors: err.errors } : {}),
      });
    return;
  }

  if (err instanceof ZodError) {
    res
      .status(400)
      .type('application/problem+json')
      .json({
        type: 'https://threadtrace.local/errors/validation-failed',
        title: 'Validation Failed',
        status: 400,
        detail: 'One or more input fields failed validation.',
        instance: req.originalUrl,
        traceId,
        errors: err.flatten().fieldErrors,
      });
    return;
  }

  if (isDbConnectionError(err)) {
    res
      .status(503)
      .type('application/problem+json')
      .json({
        type: 'https://threadtrace.local/errors/database-unavailable',
        title: 'Database Temporarily Unavailable',
        status: 503,
        detail: 'PostgreSQL is currently unreachable. Public passports remain available via cache.',
        instance: req.originalUrl,
        traceId,
      });
    return;
  }

  const anyErr = err as { code?: string; meta?: unknown; message?: string };
  if (anyErr?.code === 'P2002') {
    res
      .status(409)
      .type('application/problem+json')
      .json({
        type: 'https://threadtrace.local/errors/conflict',
        title: 'Duplicate Resource',
        status: 409,
        detail: 'A record with the same unique identifier already exists.',
        instance: req.originalUrl,
        traceId,
        errors: anyErr.meta,
      });
    return;
  }

  if (anyErr?.code === 'P2025') {
    res
      .status(404)
      .type('application/problem+json')
      .json({
        type: 'https://threadtrace.local/errors/not-found',
        title: 'Resource Not Found',
        status: 404,
        detail: 'The requested resource could not be found.',
        instance: req.originalUrl,
        traceId,
      });
    return;
  }

  console.error('[Unhandled Error]', { traceId, err });
  res
    .status(500)
    .type('application/problem+json')
    .json({
      type: 'https://threadtrace.local/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: anyErr?.message ?? 'An unexpected error occurred.',
      instance: req.originalUrl,
      traceId,
    });
}
