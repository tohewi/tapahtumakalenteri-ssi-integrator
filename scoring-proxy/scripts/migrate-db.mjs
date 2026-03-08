#!/usr/bin/env node
// One-time migration: copy data from old free PG to new Starter PG
// Run on Render shell where internal URLs work without SSL:
//   MIGRATE_SOURCE_URL=<old-internal-url> MIGRATE_TARGET_URL=<new-internal-url> node scripts/migrate-db.mjs
//
// Can also use external URLs if SSL works:
//   MIGRATE_SOURCE_URL=<old-external-url> MIGRATE_TARGET_URL=<new-external-url> node scripts/migrate-db.mjs

import pg from 'pg';
const { Client } = pg;

const SRC_URL = process.env.MIGRATE_SOURCE_URL;
const TGT_URL = process.env.MIGRATE_TARGET_URL;
if (!SRC_URL || !TGT_URL) {
  console.error('Usage: MIGRATE_SOURCE_URL=... MIGRATE_TARGET_URL=... node scripts/migrate-db.mjs');
  process.exit(1);
}

// Detect if URL is internal (no SSL) or external (needs SSL)
function clientOpts(url) {
  const isInternal = !url.includes('.render.com');
  return { connectionString: url, ssl: isInternal ? false : { rejectUnauthorized: false } };
}

async function migrate() {
  const src = new Client(clientOpts(SRC_URL));
  const tgt = new Client(clientOpts(TGT_URL));

  console.log('Source URL:', SRC_URL.replace(/:[^:@]+@/, ':***@'));
  console.log('Target URL:', TGT_URL.replace(/:[^:@]+@/, ':***@'));

  console.log('Connecting to source...');
  await src.connect();
  console.log('Connecting to target...');
  await tgt.connect();
  console.log('Both connected.');

  // Diagnostics: verify connection identity
  const srcInfo = await src.query("SELECT current_database(), current_user, current_schema()");
  console.log('Source DB:', srcInfo.rows[0].current_database, '| user:', srcInfo.rows[0].current_user, '| schema:', srcInfo.rows[0].current_schema);
  const tgtInfo = await tgt.query("SELECT current_database(), current_user, current_schema()");
  console.log('Target DB:', tgtInfo.rows[0].current_database, '| user:', tgtInfo.rows[0].current_user, '| schema:', tgtInfo.rows[0].current_schema);

  // Check ALL schemas for tables
  const { rows: allTables } = await src.query(
    "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename"
  );
  console.log('Source all tables:', allTables.map(t => t.schemaname + '.' + t.tablename).join(', ') || '(none in any schema)');

  // Get source tables (public schema)
  const { rows: tables } = await src.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log('Source public tables:', tables.map(t => t.tablename).join(', ') || '(none)');

  if (tables.length === 0) {
    console.log('No tables to migrate in public schema.');
    await src.end(); await tgt.end();
    return;
  }

  // Step 1: Recreate tables
  console.log('\n=== Creating tables ===');
  for (const { tablename } of tables) {
    const { rows: cols } = await src.query(
      `SELECT column_name, data_type, character_maximum_length, column_default, is_nullable, udt_name
       FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [tablename]
    );

    const colDefs = cols.map(c => {
      let def = `"${c.column_name}" `;
      if (c.data_type === 'USER-DEFINED') def += c.udt_name;
      else if (c.character_maximum_length) def += `${c.data_type}(${c.character_maximum_length})`;
      else def += c.data_type;
      if (c.column_default) def += ` DEFAULT ${c.column_default}`;
      if (c.is_nullable === 'NO') def += ' NOT NULL';
      return def;
    });

    const { rows: pkRows } = await src.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'
       ORDER BY kcu.ordinal_position`,
      [tablename]
    );

    let sql = `CREATE TABLE IF NOT EXISTS "${tablename}" (\n  ${colDefs.join(',\n  ')}`;
    if (pkRows.length) sql += `,\n  PRIMARY KEY (${pkRows.map(r => `"${r.column_name}"`).join(', ')})`;
    sql += '\n);';

    try { await tgt.query(sql); console.log(`  ✓ ${tablename}`); }
    catch (e) { console.error(`  ✗ ${tablename}: ${e.message}`); }
  }

  // Step 2: Copy data
  console.log('\n=== Copying data ===');
  for (const { tablename } of tables) {
    const { rows, rowCount } = await src.query(`SELECT * FROM "${tablename}"`);
    if (!rowCount) { console.log(`  ${tablename}: 0 rows`); continue; }

    const colNames = Object.keys(rows[0]);
    const colList = colNames.map(c => `"${c}"`).join(', ');
    let ok = 0;
    for (const row of rows) {
      const vals = colNames.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await tgt.query(`INSERT INTO "${tablename}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING`,
          colNames.map(c => row[c]));
        ok++;
      } catch (e) { console.error(`  INSERT ${tablename}: ${e.message}`); }
    }
    console.log(`  ${tablename}: ${ok}/${rowCount} rows`);
  }

  // Step 3: Recreate indexes
  console.log('\n=== Recreating indexes ===');
  const { rows: idxs } = await src.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname NOT LIKE '%_pkey' ORDER BY tablename"
  );
  for (const { indexdef } of idxs) {
    try {
      await tgt.query(indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'));
      console.log(`  ✓ index`);
    } catch (e) { console.error(`  ✗ index: ${e.message}`); }
  }

  // Verify
  console.log('\n=== Verification ===');
  for (const { tablename } of tables) {
    const s = await src.query(`SELECT count(*) as n FROM "${tablename}"`);
    const t = await tgt.query(`SELECT count(*) as n FROM "${tablename}"`);
    const match = s.rows[0].n === t.rows[0].n ? '✓' : '✗';
    console.log(`  ${match} ${tablename}: src=${s.rows[0].n} tgt=${t.rows[0].n}`);
  }

  console.log('\n=== Migration complete ===');
  await src.end(); await tgt.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
