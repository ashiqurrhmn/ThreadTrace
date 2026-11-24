import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { TraceService } from '../services/trace.service';

export const traceRouter = Router();

traceRouter.get('/backward/:identifier', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const maxDepth = Math.min(15, Math.max(1, Number(req.query.maxDepth ?? 10)));
    const result = await TraceService.traceBackward(req.params.identifier, req.user!, maxDepth);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

traceRouter.get('/forward/:identifier', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const maxDepth = Math.min(15, Math.max(1, Number(req.query.maxDepth ?? 10)));
    const result = await TraceService.traceForward(req.params.identifier, req.user!, maxDepth);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
