import { Router } from 'express';
import { isDatabaseReachable } from '../db/pool';
import { passportCache } from '../ports/cache.port';
import { auditRouter } from './audit.routes';
import { authRouter } from './auth.routes';
import { configRouter } from './config.routes';
import { evidenceRouter } from './evidence.routes';
import { importRouter } from './import.routes';
import { lotRouter } from './lot.routes';
import { partyRouter } from './party.routes';
import { passportRouter, publicPassportRouter } from './passport.routes';
import { traceRouter } from './trace.routes';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  const db = await isDatabaseReachable();
  res.json({
    status: db.reachable ? 'UP' : 'DEGRADED_CACHE_ONLY',
    service: 'threadtrace-api',
    timestamp: new Date().toISOString(),
    database: db,
    passportCache: passportCache.stats(),
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/parties', partyRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/lots', lotRouter);
apiRouter.use('/trace', traceRouter);
apiRouter.use('/evidences', evidenceRouter);
apiRouter.use('/passports', passportRouter);
apiRouter.use('/public/passports', publicPassportRouter);
apiRouter.use('/imports', importRouter);
apiRouter.use('/audit', auditRouter);
