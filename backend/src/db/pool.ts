import { Pool } from 'pg';
import { env } from '../config/env';

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pgPool.on('error', (err) => {
  // Prevent unhandled pool error crash when PostgreSQL is stopped during QA4 DB-down demo
  console.warn('[pgPool] Idle client error (expected if DB is stopped for QA4 demo):', err.message);
});

export async function isDatabaseReachable(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    await pgPool.query('SELECT 1');
    return { reachable: true, latencyMs: Math.round((performance.now() - start) * 100) / 100 };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      error: err instanceof Error ? err.message : 'Database unreachable',
    };
  }
}

export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
  const code = String((err as { code?: unknown }).code ?? '').toUpperCase();
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1008' ||
    code === 'P1017' ||
    msg.includes("can't reach database server") ||
    msg.includes('connection terminated') ||
    msg.includes('econnrefused') ||
    msg.includes('connect etimedout') ||
    msg.includes('server closed the connection')
  );
}
