import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { IntegrityService } from '../services/integrity.service';
import { PassportService } from '../services/passport.service';

export const passportRouter = Router();
export const publicPassportRouter = Router();

const createPassportSchema = z.object({
  passportCode: z.string().min(3).max(60),
  styleCode: z.string().min(2).max(60),
  shipmentRef: z.string().min(2).max(80),
  lotId: z.string().uuid(),
  brandId: z.string().uuid(),
  allocationMethod: z.enum(['MASS', 'PIECE_COUNT']).optional(),
  careAndRepair: z.record(z.unknown()).optional(),
  endOfLifeGuidance: z.record(z.unknown()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const publishVersionSchema = z.object({
  allocationMethod: z.enum(['MASS', 'PIECE_COUNT']).optional(),
  customFields: z.record(z.unknown()).optional(),
  careAndRepair: z.record(z.unknown()).optional(),
  endOfLifeGuidance: z.record(z.unknown()).optional(),
});

/**
 * PUBLIC QR Passport Endpoints (NO AUTH, HTTP Caching + ETag + QA4 DB-Down Disk Cache Fallback)
 */
publicPassportRouter.get('/:code', async (req, res, next) => {
  try {
    const result = await PassportService.getPublicPassportWithFallback(req.params.code);
    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    res.setHeader('X-Cache-Status', result.cacheStatus);

    if (req.header('if-none-match') === result.etag) {
      res.status(304).end();
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

publicPassportRouter.get('/:code/versions/:version', async (req, res, next) => {
  try {
    const version = Number(req.params.version);
    const result = await PassportService.getPublicPassportWithFallback(req.params.code, version);
    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'public, max-age=300, immutable');
    res.setHeader('X-Cache-Status', result.cacheStatus);

    if (req.header('if-none-match') === result.etag) {
      res.status(304).end();
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * AUTHENTICATED Passport Management & Audience-Scoped Endpoints (FR7, FR8, FR10)
 */
passportRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const search = typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined;
    const result = await PassportService.listPassports(req.user!, { page, limit, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

passportRouter.get('/:code', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const version = req.query.version ? Number(req.query.version) : undefined;
    const result = await PassportService.getAudiencePassport(req.params.code, req.user!, version);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

passportRouter.get('/:code/verify', async (req, res, next) => {
  try {
    const verification = await IntegrityService.verifyPassport(req.params.code);
    res.json(verification);
  } catch (err) {
    next(err);
  }
});

passportRouter.post('/', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = createPassportSchema.parse(req.body);
    const created = await PassportService.createPassport(body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

passportRouter.post('/:code/versions', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = publishVersionSchema.parse(req.body ?? {});
    const created = await PassportService.publishNewVersion(req.params.code, body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});
