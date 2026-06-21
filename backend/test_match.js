import('./src/db.js').then(async ({ initDB, queryAll }) => {
  import('./src/semantic.js').then(async ({ getEmbedding, bufferToVector, cosineSimilarity }) => {
    console.log('[Test] Init DB...');
    await initDB();
    console.log('[Test] DB ready.');

    console.log('[Test] Computing intent embedding...');
    const intent = '这篇是科技新闻，要突出时间线，有图片和代码块';
    const intentVec = await getEmbedding(intent);
    console.log('[Test] Intent vec dim:', intentVec.length);

    console.log('[Test] Querying active versions...');
    const t0 = Date.now();
    const active = queryAll(`
      SELECT cv.id as version_id, cv.component_id, cv.semantic_vector, cv.version,
             c.name, c.semantic_description, c.category
      FROM component_versions cv
      JOIN components c ON c.id = cv.component_id
      WHERE cv.is_active = 1
    `);
    console.log('[Test] Query took', Date.now() - t0, 'ms, rows:', active.length);

    const scored = [];
    for (const row of active) {
      console.log('[Test] Processing', row.name, 'vector type:', typeof row.semantic_vector, 'len:', row.semantic_vector?.length);
      const compVec = bufferToVector(row.semantic_vector);
      console.log('[Test]  -> vec dim:', compVec?.length);
      const score = cosineSimilarity(intentVec, compVec);
      scored.push({ name: row.name, score });
    }
    scored.sort((a, b) => b.score - a.score);
    console.log('[Test] Results:');
    console.log(JSON.stringify(scored, null, 2));
    process.exit(0);
  });
}).catch(e => { console.error(e); process.exit(1); });
