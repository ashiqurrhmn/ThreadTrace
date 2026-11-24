import { Router } from 'express';
import { prisma } from '../db/prisma';
import { isDatabaseReachable } from '../db/pool';
import { AuthenticatedRequest, optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { passportCache } from '../ports/cache.port';
import { AuditService } from '../services/audit.service';

export const auditRouter = Router();

auditRouter.get('/overview', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const dbHealth = await isDatabaseReachable();
    if (!dbHealth.reachable) {
      res.json({
        dbHealth,
        cache: passportCache.stats(),
        cachedPassports: passportCache.listKeys(),
        offlineMode: true,
      });
      return;
    }

    const brandFilter =
      req.user?.role === 'BRAND_USER' && req.user.brandId ? { brandId: req.user.brandId } : {};

    const [parties, lots, events, passports, activeCerts, expiringAlerts, importJobs] = await Promise.all([
      prisma.party.count(),
      prisma.lot.count({ where: brandFilter }),
      prisma.lotEvent.count(),
      prisma.passport.count({ where: brandFilter }),
      prisma.evidence.count({ where: { status: 'VALID' } }),
      prisma.expiryAlert.count({ where: { acknowledged: false } }),
      prisma.importJob.count(),
    ]);

    res.json({
      dbHealth,
      offlineMode: false,
      counts: {
        parties,
        lots,
        events,
        passports,
        activeCerts,
        expiringAlerts,
        importJobs,
      },
      cache: passportCache.stats(),
      cachedPassports: passportCache.listKeys(),
    });
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/defects', requireAuth, async (_req, res, next) => {
  try {
    const report = await AuditService.runClaimAndDefectAudit();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/confidentiality', requireAuth, async (_req, res, next) => {
  try {
    const report = await AuditService.runConfidentialityScan();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/cache-status', async (_req, res) => {
  const dbHealth = await isDatabaseReachable();
  res.json({
    dbHealth,
    cache: passportCache.stats(),
    cachedSnapshots: passportCache.listKeys(),
  });
});
