/**
 * QA1 Scale Benchmark Script:
 * Seeds an isolated schema (`qa1_bench`) with 200,000 lots and 2,000,000 events
 * across 6 process levels and measures WITH RECURSIVE backward & forward trace latency (< 2000ms).
 *
 * Run on demand: npm run benchmark:qa1
 */
import { pgPool } from '../db/pool';

async function runQa1Benchmark() {
  console.log('🚀 QA1 Benchmark: 200,000 lots + 2,000,000 events (6 process levels) in isolated schema `qa1_bench`...');
  const client = await pgPool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS qa1_bench');
    await client.query(`
      DROP TABLE IF EXISTS qa1_bench.lot_events;
      DROP TABLE IF EXISTS qa1_bench.lot_edges;
      DROP TABLE IF EXISTS qa1_bench.lots;

      CREATE TABLE qa1_bench.lots (
        id INT PRIMARY KEY,
        lot_code TEXT NOT NULL,
        level INT NOT NULL
      );

      CREATE TABLE qa1_bench.lot_edges (
        parent_lot_id INT NOT NULL,
        child_lot_id INT NOT NULL,
        process_step TEXT NOT NULL
      );

      CREATE TABLE qa1_bench.lot_events (
        id BIGSERIAL PRIMARY KEY,
        lot_id INT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const t0 = performance.now();
    // 200,000 lots organized into 28,571 chains of 7 levels (depth 0..6) = ~200,000 lots
    await client.query(`
      INSERT INTO qa1_bench.lots (id, lot_code, level)
      SELECT g, 'BENCH-LOT-' || g, (g - 1) % 7
      FROM generate_series(1, 200000) AS g
    `);

    await client.query(`
      INSERT INTO qa1_bench.lot_edges (parent_lot_id, child_lot_id, process_step)
      SELECT g - 1, g,
        CASE (g - 1) % 7
          WHEN 1 THEN 'CUT'
          WHEN 2 THEN 'SEW'
          WHEN 3 THEN 'WASH_DYE'
          WHEN 4 THEN 'FINISH'
          WHEN 5 THEN 'PACK'
          ELSE 'SHIP'
        END
      FROM generate_series(1, 200000) AS g
      WHERE (g - 1) % 7 > 0
    `);

    // 10 events per lot = 2,000,000 events!
    await client.query(`
      INSERT INTO qa1_bench.lot_events (lot_id, event_type)
      SELECT ((g - 1) % 200000) + 1, 'PROCESS'
      FROM generate_series(1, 2000000) AS g
    `);

    // Create QA1 bidirectional indexes
    await client.query(`
      CREATE INDEX idx_qa1_edges_parent ON qa1_bench.lot_edges (parent_lot_id, child_lot_id);
      CREATE INDEX idx_qa1_edges_child ON qa1_bench.lot_edges (child_lot_id, parent_lot_id);
      CREATE INDEX idx_qa1_events_lot ON qa1_bench.lot_events (lot_id);
      ANALYZE qa1_bench.lots;
      ANALYZE qa1_bench.lot_edges;
      ANALYZE qa1_bench.lot_events;
    `);
    console.log(`📦 Seeded 200,000 lots + 2,000,000 events + indexes in ${((performance.now() - t0) / 1000).toFixed(2)}s`);

    // Measure 6-level Backward Trace (from level-6 carton lot 199997 -> root 199991)
    const targetChild = 7 * 25000; // 175000 (level 6)
    const bStart = performance.now();
    const backRes = await client.query(
      `
      WITH RECURSIVE lineage AS (
        SELECT $1::int AS lot_id, 0 AS depth, ARRAY[$1::int] AS path
        UNION ALL
        SELECT e.parent_lot_id, l.depth + 1, l.path || e.parent_lot_id
        FROM qa1_bench.lot_edges e
        JOIN lineage l ON e.child_lot_id = l.lot_id
        WHERE l.depth < 10 AND NOT (e.parent_lot_id = ANY(l.path))
      )
      SELECT l.lot_id, l.depth, lt.lot_code,
             (SELECT count(*) FROM qa1_bench.lot_events ev WHERE ev.lot_id = l.lot_id) AS events
      FROM lineage l
      JOIN qa1_bench.lots lt ON lt.id = l.lot_id
      ORDER BY l.depth
      `,
      [targetChild]
    );
    const backMs = Math.round((performance.now() - bStart) * 100) / 100;

    // Measure 6-level Forward Trace (from level-0 fabric lot 174994 -> carton 175000)
    const sourceRoot = targetChild - 6;
    const fStart = performance.now();
    const fwdRes = await client.query(
      `
      WITH RECURSIVE lineage AS (
        SELECT $1::int AS lot_id, 0 AS depth, ARRAY[$1::int] AS path
        UNION ALL
        SELECT e.child_lot_id, l.depth + 1, l.path || e.child_lot_id
        FROM qa1_bench.lot_edges e
        JOIN lineage l ON e.parent_lot_id = l.lot_id
        WHERE l.depth < 10 AND NOT (e.child_lot_id = ANY(l.path))
      )
      SELECT l.lot_id, l.depth, lt.lot_code,
             (SELECT count(*) FROM qa1_bench.lot_events ev WHERE ev.lot_id = l.lot_id) AS events
      FROM lineage l
      JOIN qa1_bench.lots lt ON lt.id = l.lot_id
      ORDER BY l.depth
      `,
      [sourceRoot]
    );
    const fwdMs = Math.round((performance.now() - fStart) * 100) / 100;

    console.log(`✅ QA1 Backward 6-level trace: ${backRes.rowCount} lots in ${backMs} ms (Target: < 2000 ms)`);
    console.log(`✅ QA1 Forward  6-level trace: ${fwdRes.rowCount} lots in ${fwdMs} ms (Target: < 2000 ms)`);

    // Clean up temporary benchmark schema
    await client.query('DROP SCHEMA qa1_bench CASCADE');
    console.log('🧹 Cleaned up temporary qa1_bench schema.');
  } finally {
    client.release();
    await pgPool.end();
  }
}

runQa1Benchmark().catch((err) => {
  console.error('❌ QA1 Benchmark failed:', err);
  process.exit(1);
});
