import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { EvidenceService } from '../services/evidence.service';

export const evidenceRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const createEvidenceSchema = z.object({
  certificateNumber: z.string().min(2).max(80),
  certTypeCode: z.string().min(2).max(40),
  issuer: z.string().min(2).max(160),
  scope: z.string().min(2).max(300),
  partyId: z.string().uuid().optional().or(z.literal('')),
  lotId: z.string().uuid().optional().or(z.literal('')),
  validFrom: z.string().min(8),
  validUntil: z.string().min(8),
  certifiedPercent: z.coerce.number().min(0).max(100).optional(),
});

evidenceRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const partyId = typeof req.query.partyId === 'string' && req.query.partyId ? req.query.partyId : undefined;
    const lotId = typeof req.query.lotId === 'string' && req.query.lotId ? req.query.lotId : undefined;
    const result = await EvidenceService.listEvidences({ page, limit, status, partyId, lotId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

evidenceRouter.get('/alerts', requireAuth, async (req, res, next) => {
  try {
    const onlyUnack = req.query.unacknowledged === 'true';
    const alerts = await EvidenceService.listAlerts(onlyUnack);
    res.json({ items: alerts });
  } catch (err) {
    next(err);
  }
});

evidenceRouter.post(
  '/',
  requireAuth,
  requireRoles('AUDITOR', 'FACTORY_ADMIN'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const body = createEvidenceSchema.parse(req.body);
      const created = await EvidenceService.createEvidence({
        certificateNumber: body.certificateNumber,
        certTypeCode: body.certTypeCode,
        issuer: body.issuer,
        scope: body.scope,
        partyId: body.partyId || null,
        lotId: body.lotId || null,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        certifiedPercent: body.certifiedPercent,
        file: req.file
          ? {
              buffer: req.file.buffer,
              originalName: req.file.originalname,
              mimeType: req.file.mimetype,
            }
          : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

evidenceRouter.post('/sweep', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (_req, res, next) => {
  try {
    const result = await EvidenceService.runExpirySweep();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

evidenceRouter.post('/:id/simulate-expire', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const updated = await EvidenceService.simulateExpire(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

evidenceRouter.post('/:id/renew', requireAuth, requireRoles('AUDITOR', 'FACTORY_ADMIN'), async (req, res, next) => {
  try {
    const extendDays = Number(req.body?.extendDays ?? 180);
    const updated = await EvidenceService.renewCertificate(req.params.id, extendDays);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

evidenceRouter.get('/:id/file', requireAuth, async (req, res, next) => {
  try {
    const file = await EvidenceService.downloadFile(req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});
