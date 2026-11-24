import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { ProblemError } from '../errors/problemDetails';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { ImportService } from '../services/import.service';

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

importRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const result = await ImportService.listJobs(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

importRouter.post(
  '/upload',
  requireAuth,
  requireRoles('AUDITOR', 'FACTORY_ADMIN'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) {
        throw new ProblemError({
          status: 400,
          title: 'File Required',
          detail: 'Please attach a CSV or Excel (.xlsx) file in the "file" field.',
        });
      }

      const rawType = String(req.body?.importType ?? 'CUTTING_REPORT').toUpperCase();
      const importType = (
        ['CUTTING_REPORT', 'PACKING_LIST', 'LOT_EVENTS'].includes(rawType) ? rawType : 'CUTTING_REPORT'
      ) as 'CUTTING_REPORT' | 'PACKING_LIST' | 'LOT_EVENTS';

      const job = await ImportService.processUpload({
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        importType,
        user: req.user!,
      });

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  }
);

importRouter.get('/samples/:name', (req, res, next) => {
  const safeName = path.basename(req.params.name);
  const fullPath = path.join(env.SAMPLES_ABS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    next(
      new ProblemError({
        status: 404,
        title: 'Sample Not Found',
        detail: `Sample file '${safeName}' does not exist.`,
      })
    );
    return;
  }
  res.download(fullPath, safeName);
});
