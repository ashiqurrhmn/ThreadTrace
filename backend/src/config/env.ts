import dotenv from 'dotenv';
import os from 'os';
import { z } from 'zod';
import path from 'path';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CACHE_DIR: z.string().default('./data/passport-cache'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const backendRoot = path.resolve(__dirname, '../..');
const isVercel = Boolean(process.env.VERCEL);

export const env = {
  ...parsed.data,
  CACHE_ABS_DIR: isVercel
    ? path.join(os.tmpdir(), 'passport-cache')
    : path.resolve(backendRoot, parsed.data.CACHE_DIR),
  UPLOAD_ABS_DIR: isVercel
    ? path.join(os.tmpdir(), 'uploads')
    : path.resolve(backendRoot, parsed.data.UPLOAD_DIR),
  SAMPLES_ABS_DIR: path.resolve(backendRoot, './data/samples'),
};
