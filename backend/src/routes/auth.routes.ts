import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const demoSwitchSchema = z.object({
  persona: z.enum(['AUDITOR', 'FACTORY_ADMIN', 'BRAND_NW', 'BRAND_ES']),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await AuthService.login(body.email, body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/demo-switch', async (req, res, next) => {
  try {
    const body = demoSwitchSchema.parse(req.body);
    const result = await AuthService.demoSwitch(body.persona);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/demo-accounts', async (_req, res, next) => {
  try {
    const accounts = await AuthService.listDemoAccounts();
    res.json({ items: accounts });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', optionalAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});
