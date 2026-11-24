import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { FootprintService } from '../services/footprint.service';
import { IntegrityService } from '../services/integrity.service';
import { LotEventService } from '../services/lotEvent.service';

export const lotRouter = Router();

const createLotSchema = z.object({
  lotCode: z.string().min(2).max(60),
  materialType: z.string().min(2).max(160),
  styleCode: z.string().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  partyId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.enum(['KG', 'PIECES', 'CARTONS']),
  weightKg: z.coerce.number().positive(),
  pieceCount: z.coerce.number().int().positive().nullable().optional(),
  fibreComposition: z
    .array(z.object({ fibre: z.string().min(1), percent: z.coerce.number().min(0).max(100) }))
    .optional(),
  claimedOrganicPct: z.coerce.number().min(0).max(100).optional(),
  claimedRecycledPct: z.coerce.number().min(0).max(100).optional(),
  isRootSource: z.boolean().optional(),
});

const recordEventSchema = z.object({
  eventType: z.string().min(2).max(40),
  partyId: z.string().uuid(),
  productionLineId: z.string().uuid().nullable().optional(),
  inputQuantity: z.coerce.number().positive(),
  outputQuantity: z.coerce.number().nonnegative(),
  unit: z.enum(['KG', 'PIECES', 'CARTONS']),
  inputWeightKg: z.coerce.number().positive(),
  outputWeightKg: z.coerce.number().nonnegative(),
  waterLiters: z.coerce.number().nonnegative().optional(),
  energyKwh: z.coerce.number().nonnegative().optional(),
  co2eKg: z.coerce.number().nonnegative().optional(),
  correctionOfEventId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const splitLotSchema = z.object({
  processStep: z.string().min(2).max(40).default('CUT'),
  partyId: z.string().uuid(),
  productionLineId: z.string().uuid().nullable().optional(),
  children: z
    .array(
      z.object({
        lotCode: z.string().min(2).max(60),
        materialType: z.string().min(2).max(160),
        styleCode: z.string().nullable().optional(),
        brandId: z.string().uuid().nullable().optional(),
        quantity: z.coerce.number().positive(),
        unit: z.enum(['KG', 'PIECES', 'CARTONS']),
        weightKg: z.coerce.number().positive(),
        pieceCount: z.coerce.number().int().positive().nullable().optional(),
        claimedOrganicPct: z.coerce.number().min(0).max(100).optional(),
        claimedRecycledPct: z.coerce.number().min(0).max(100).optional(),
      })
    )
    .min(2),
});

const mergeLotsSchema = z.object({
  processStep: z.string().min(2).max(40).default('SEW'),
  partyId: z.string().uuid(),
  productionLineId: z.string().uuid().nullable().optional(),
  parentAllocations: z
    .array(
      z.object({
        parentLotId: z.string().uuid(),
        allocatedWeightKg: z.coerce.number().positive(),
        allocatedPieces: z.coerce.number().int().positive().nullable().optional(),
      })
    )
    .min(2),
  child: z.object({
    lotCode: z.string().min(2).max(60),
    materialType: z.string().min(2).max(160),
    styleCode: z.string().nullable().optional(),
    brandId: z.string().uuid().nullable().optional(),
    quantity: z.coerce.number().positive(),
    unit: z.enum(['KG', 'PIECES', 'CARTONS']),
    weightKg: z.coerce.number().positive(),
    pieceCount: z.coerce.number().int().positive().nullable().optional(),
    fibreComposition: z
      .array(z.object({ fibre: z.string().min(1), percent: z.coerce.number().min(0).max(100) }))
      .optional(),
    claimedOrganicPct: z.coerce.number().min(0).max(100).optional(),
    claimedRecycledPct: z.coerce.number().min(0).max(100).optional(),
  }),
});

lotRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const brandId = typeof req.query.brandId === 'string' && req.query.brandId ? req.query.brandId : undefined;
    const search = typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined;
    const result = await LotEventService.listLots(req.user!, { page, limit, status, brandId, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

lotRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const lot = await LotEventService.getLotById(req.params.id, req.user!);
    res.json(lot);
  } catch (err) {
    next(err);
  }
});

lotRouter.post('/', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = createLotSchema.parse(req.body);
    const created = await LotEventService.createLot(body, req.user!);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

lotRouter.post('/:id/events', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = recordEventSchema.parse(req.body);
    const event = await LotEventService.recordEvent({ ...body, lotId: req.params.id }, req.user!);
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

lotRouter.post('/:id/split', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = splitLotSchema.parse(req.body);
    const result = await LotEventService.splitLot({ ...body, parentLotId: req.params.id }, req.user!);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

lotRouter.post('/merge', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = mergeLotsSchema.parse(req.body);
    const result = await LotEventService.mergeLots(body, req.user!);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

lotRouter.get('/:id/footprint', requireAuth, async (req, res, next) => {
  try {
    const method =
      req.query.method === 'PIECE_COUNT' ? 'PIECE_COUNT' : req.query.method === 'MASS' ? 'MASS' : undefined;
    const footprint = await FootprintService.calculateForLot(req.params.id, method);
    res.json(footprint);
  } catch (err) {
    next(err);
  }
});

lotRouter.get('/:id/verify', requireAuth, async (req, res, next) => {
  try {
    const verification = await IntegrityService.verifyLot(req.params.id);
    res.json(verification);
  } catch (err) {
    next(err);
  }
});
