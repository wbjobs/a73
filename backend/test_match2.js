import('./src/db.js').then(async ({ initDB, queryAll, queryOne, runSql, getDb }) => {
  console.log('[Test] Step 1: Init DB...');
  await initDB();
  console.log('[Test] DB ready.');

  console.log('[Test] Step 2: Query components (no BLOB)...');
  const t1 = Date.now();
  const comps = queryAll('SELECT id, name, category, semantic_description FROM components');
  console.log('[Test] Got', comps.length, 'rows in', Date.now() - t1, 'ms');
  comps.forEach(c => console.log('  -', c.id, c.name, '(' + c.category + ')'));

  console.log('[Test] Step 3: Query component_versions (WITHOUT semantic_vector)...');
  const t2 = Date.now();
  const vers = queryAll('SELECT id, component_id, version, is_active FROM component_versions WHERE is_active = 1');
  console.log('[Test] Got', vers.length, 'rows in', Date.now() - t2, 'ms');
  vers.forEach(v => console.log('  -', v.id, 'comp=', v.component_id, 'v=', v.version));

  console.log('[Test] Step 4: Query semantic_vector length only (avoid loading full BLOB)...');
  const t3 = Date.now();
  const vecs = queryAll('SELECT id, component_id, length(semantic_vector) as vec_len FROM component_versions WHERE is_active = 1');
  console.log('[Test] Got', vecs.length, 'rows in', Date.now() - t3, 'ms');
  vecs.forEach(v => console.log('  - id=', v.id, 'len=', v.vec_len));

  console.log('[Test] Step 5: Full query with semantic_vector ONE BY ONE...');
  for (const v of vecs) {
    const t4 = Date.now();
    try {
      const one = queryOne('SELECT semantic_vector FROM component_versions WHERE id = ?', [v.id]);
      const vec = one && one.semantic_vector;
      console.log('  -', v.id, 'got vector type=', typeof vec, 'len=', vec?.length, 'time=', Date.now() - t4, 'ms');
    } catch (e) {
      console.log('  -', v.id, 'ERROR:', e.message);
    }
  }

  console.log('[Test] All steps done!');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
