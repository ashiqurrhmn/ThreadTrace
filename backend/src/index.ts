import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiSpec } from './docs/openapi';
import { problemDetailsHandler } from './errors/problemDetails';
import { logger, traceIdMiddleware } from './middleware/traceId.middleware';
import { apiRouter } from './routes';
import { ConfigService } from './services/config.service';
import { EvidenceService } from './services/evidence.service';
import { PassportService } from './services/passport.service';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed =
          origin === env.FRONTEND_URL ||
          origin === 'http://localhost:3000' ||
          origin === 'http://127.0.0.1:3000' ||
          origin.endsWith('.vercel.app');
        callback(null, allowed);
      },
      exposedHeaders: ['ETag', 'X-Cache-Status', 'x-trace-id'],
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(traceIdMiddleware);

  // Register Observer Pattern subscribers (FR5: Expiry alerts + automatic passport claim drop)
  EvidenceService.registerAlertObserver();
  PassportService.registerExpiryObserver();

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use('/api/v1', apiRouter);

  app.get('/', (_req, res) => {
    res.json({
      name: 'ThreadTrace API',
      docs: '/api/docs',
      health: '/api/v1/health',
    });
  });

  app.use(problemDetailsHandler);
  return app;
}

async function bootstrap() {
  const app = createApp();

  // Ensure config defaults exist if DB is reachable on startup
  try {
    await ConfigService.ensureDefaults();
  } catch (err) {
    logger.warn({ err }, 'Starting without initial DB sync (public passport cache remains active)');
  }

  // Scheduled certificate expiry sweep (runs every 6 hours — FR5)
  cron.schedule('0 */6 * * *', async () => {
    try {
      const summary = await EvidenceService.runExpirySweep();
      logger.info({ summary }, 'Scheduled certificate expiry sweep completed');
    } catch (err) {
      logger.warn({ err }, 'Scheduled expiry sweep skipped (DB unreachable)');
    }
  });

  app.listen(env.PORT, () => {
    logger.info(`ThreadTrace API running on http://localhost:${env.PORT}`);
    logger.info(`OpenAPI Swagger UI: http://localhost:${env.PORT}/api/docs`);
  });
}

export const app = createApp();
export default app;

if (require.main === module && !process.env.VERCEL) {
  bootstrap();
}
