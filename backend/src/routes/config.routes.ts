import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { ConfigService } from '../services/config.service';

export const configRouter = Router();

const processConfigSchema = z.object({
  code: z.string().min(2).max(40),
  label: z.string().min(2).max(120),
  sequenceOrder: z.coerce.number().int().min(1),
  maxLossPercent: z.coerce.number().min(0).max(100),
  enforcementMode: z.enum(['BLOCK', 'FLAG']),
  waterLitersPerKg: z.coerce.number().min(0),
  energyKwhPerKg: z.coerce.number().min(0),
  co2eKgPerKg: z.coerce.number().min(0),
  active: z.boolean().optional(),
});

const certTypeSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(160),
  claimTag: z.string().nullable().optional(),
  requiresFile: z.boolean().optional(),
  defaultValidityDays: z.coerce.number().int().positive().optional(),
  active: z.boolean().optional(),
});

const allocationSchema = z.object({
  method: z.enum(['MASS', 'PIECE_COUNT']),
});

const customFieldsSchema = z.object({
  fields: z.array(
    z.object({
      key: z.string().min(2).max(60).regex(/^[a-zA-Z0-9_]+$/),
      label: z.string().min(2).max(120),
      defaultValue: z.string().optional(),
    })
  ),
});

configRouter.get('/', async (_req, res, next) => {
  try {
    const cfg = await ConfigService.getAllConfig();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
});

configRouter.put('/processes', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = processConfigSchema.parse(req.body);
    const saved = await ConfigService.upsertProcessConfig(body);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

configRouter.put('/cert-types', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = certTypeSchema.parse(req.body);
    const saved = await ConfigService.upsertCertTypeConfig(body);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

configRouter.put('/allocation-method', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = allocationSchema.parse(req.body);
    const saved = await ConfigService.setAllocationMethod(body.method);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

configRouter.put('/custom-passport-fields', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const body = customFieldsSchema.parse(req.body);
    const saved = await ConfigService.setCustomPassportFields(body.fields);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});
