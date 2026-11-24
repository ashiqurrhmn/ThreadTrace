import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { PartyService } from '../services/party.service';

export const partyRouter = Router();

const createPartySchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(160),
  type: z.enum(['SPINNING_MILL', 'FABRIC_MILL', 'DYE_HOUSE', 'WASH_PLANT', 'TRIMS_SUPPLIER', 'FACTORY']),
  country: z.string().min(2),
  city: z.string().min(2),
  exactAddress: z.string().min(3),
  workerCount: z.coerce.number().int().nonnegative(),
  unitPriceUsd: z.coerce.number().nonnegative(),
  contactEmail: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
});

const createLineSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  partyId: z.string().uuid(),
  processType: z.string().min(2),
  capacityPerDay: z.coerce.number().int().positive(),
});

partyRouter.get('/brands', async (_req, res, next) => {
  try {
    const brands = await PartyService.listBrands();
    res.json({ items: brands });
  } catch (err) {
    next(err);
  }
});

partyRouter.get('/', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined;
    const search = typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined;
    const result = await PartyService.listParties(req.user!, { page, limit, type, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

partyRouter.get('/lines', optionalAuth, async (req, res, next) => {
  try {
    const partyId = typeof req.query.partyId === 'string' && req.query.partyId ? req.query.partyId : undefined;
    const lines = await PartyService.listProductionLines(partyId);
    res.json({ items: lines });
  } catch (err) {
    next(err);
  }
});

partyRouter.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const party = await PartyService.getPartyById(req.params.id, req.user!);
    res.json(party);
  } catch (err) {
    next(err);
  }
});

partyRouter.post('/', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = createPartySchema.parse(req.body);
    const created = await PartyService.createParty(body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

partyRouter.post('/lines', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = createLineSchema.parse(req.body);
    const created = await PartyService.createProductionLine(body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});
