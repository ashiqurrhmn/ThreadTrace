import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'threadtrace-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface TracedRequest extends Request {
  traceId?: string;
}

export function traceIdMiddleware(req: TracedRequest, res: Response, next: NextFunction): void {
  const incoming = req.header('x-trace-id');
  const traceId = incoming && incoming.trim().length > 0 ? incoming.trim() : crypto.randomUUID();
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);

  const start = performance.now();
  res.on('finish', () => {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logger.info({
      traceId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
