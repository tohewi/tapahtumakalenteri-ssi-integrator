#!/usr/bin/env node
// One-time migration: copy data from old PG (pr-102) to new Starter PG (v8)
// Runs on Render where internal URLs work without SSL.
// Target schema must already exist (created by initPostgres on first startup).
//
// Usage:
//   MIGRATE_SOURCE_URL=<old-url> MIGRATE_TARGET_URL=<new-url> node scripts/migrate-db.mjs

import pg from 'pg';
const { Client } = pg;

const SRC_URL = process.env.MIGRATE_SOURCE_URL;
const TGT_URL = process.env.MIGRATE_TARGET_URL;
if (!SRC_URL || !TGT_URL) {
  console.error('Usage: MIGRATE_SOURCE_URL=... MIGRATE_TARGET_URL=... node scripts/migrate-db.mjs');
  process.exit(1);
}

// FK-safe insert order (parents before children)
const INSERT_ORDER = [
  'accounts', 'tenants', 'disciplines', 'match_templates',
  'scheduled_events', 'tenant_members', 'tenant_invitations', 'audit_log'
];
// Reverse for truncation (children before parents)
const TRUNCATE_ORDER = [...INSERT_ORDER].reverse();

function clientOpts(url) {
  const isInternal = !url.includes('.render.com');
  return { connectionString: url, ssl: isInternal ? false : { rejectUnauthorized: false } };
}

async function migrate() {
  const src = new Client(clientOpts(SRC_URL));
  const tgt = new Client(clientOpts(TGT_URL));

  console.log('Source:', SRC_URL.replace(/:[^:@]+@/, ':***@'));
  console.log('Target:', TGT_URL.replace(/:[^:@]+@/, ':***@'));

  await src.connect();
  await tgt.connect();
  console.log('Both connected.');

  // Diagnostics
  const srcInfo = await src.query("SELECT current_database(), current_user");
  const tgtInfo = await tgt.query("SELECT current_database(), current_user");
  console.log('Source DB:', srcInfo.rows[0].current_database, '| user:', srcInfo.rows[0].current_user);
  console.log('Target DB:', tgtInfo.rows[0].current_database, '| user:', tgtInfo.rows[0].current_user);

  // Get tables in both source and target
  const { rows: srcTables } = await src.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  const { rows: tgtTables } = await tgt.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  const srcSet = new Set(srcTables.map(t => t.tablename));
  const tgtSet = new Set(tgtTables.map(t => t.tablename));

  console.log('Source tables:', [...srcSet].join(', '));
  console.log('Target tables:', [...tgtSet].join(', '));

  // Only migrate tables in INSERT_ORDER that exist in both
  const toMigrate = INSERT_ORDER.filter(t => srcSet.has(t) && tgtSet.has(t));
  const srcOnly = [...srcSet].filter(t => !tgtSet.has(t));
  const tgtOnly = [...tgtSet].filter(t => !srcSet.has(t));
  console.log('Will migrate:', toMigrate.join(', '));
  if (srcOnly.length) console.log('Source-only (skipped):', srcOnly.join(', '));
  if (tgtOnly.length) console.log('Target-only (kept):', tgtOnly.join(', '));

  if (toMigrate.length === 0) {
    console.log('No tables to migrate.');
    await src.end(); await tgt.end();
    return;
  }

  // Step 1: Truncate target tables in reverse FK order
  console.log('\n=== Truncating target tables ===');
  const toTruncate = TRUNCATE_ORDER.filter(t => toMigrate.includes(t));
  for (const table of toTruncate) {
    try {
      await tgt.query(`TRUNCATE "${table}" CASCADE`);
      console.log(`  ✓ ${table}`);
    } catch (e) { console.error(`  ✗ ${table}: ${e.message}`); }
  }

  // Step 2: Copy data in FK-safe order (with type-aware casting)
  console.log('\n=== Copying data ===');
  for (const table of toMigrate) {
    // Get target column types so we can cast properly
    const { rows: tgtCols } = await tgt.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]
    );
    const colTypes = {};
    for (const c of tgtCols) colTypes[c.column_name] = c.udt_name; // e.g. jsonb, _text, timestamptz

    const { rows, rowCount } = await src.query(`SELECT * FROM "${table}"`);
    if (!rowCount) { console.log(`  ${table}: 0 rows (empty)`); continue; }

    const colNames = Object.keys(rows[0]);
    const colList = colNames.map(c => `"${c}"`).join(', ');

    // Build placeholders with casts for JSONB and array columns
    const placeholders = colNames.map((c, i) => {
      const udt = colTypes[c] || '';
      if (udt === 'jsonb') return `$${i + 1}::jsonb`;
      if (udt === 'json') return `$${i + 1}::json`;
      if (udt.startsWith('_')) return `$${i + 1}::${udt.slice(1)}[]`; // e.g. _text -> text[]
      return `$${i + 1}`;
    }).join(', ');

    let ok = 0, fail = 0;
    for (const row of rows) {
      // Convert values: ensure JSONB columns get valid JSON strings
      const values = colNames.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return null;
        const udt = colTypes[c] || '';
        if ((udt === 'jsonb' || udt === 'json') && typeof val !== 'string') {
          return JSON.stringify(val);
        }
        if (udt.startsWith('_') && Array.isArray(val)) {
          return val; // pg handles arrays natively
        }
        return val;
      });
      try {
        await tgt.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values);
        ok++;
      } catch (e) {
        fail++;
        if (fail <= 3) console.error(`  INSERT ${table}: ${e.message}`);
        if (fail === 4) console.error(`  INSERT ${table}: ... (suppressing further errors)`);
      }
    }
    console.log(`  ${table}: ${ok}/${rowCount} rows` + (fail ? ` (${fail} failed)` : ''));
  }

  // Step 3: Verify counts
  console.log('\n=== Verification ===');
  let allMatch = true;
  for (const table of toMigrate) {
    const s = await src.query(`SELECT count(*) as n FROM "${table}"`);
    const t = await tgt.query(`SELECT count(*) as n FROM "${table}"`);
    const match = s.rows[0].n === t.rows[0].n;
    if (!match) allMatch = false;
    console.log(`  ${match ? '✓' : '✗'} ${table}: src=${s.rows[0].n} tgt=${t.rows[0].n}`);
  }

  console.log(allMatch ? '\n✅ Migration complete — all counts match!' : '\n⚠️  Migration complete with mismatches');
  await src.end(); await tgt.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
