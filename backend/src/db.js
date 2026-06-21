import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, '..', 'data.json');
const VECTOR_FILE = path.join(__dirname, '..', 'vectors.bin');

let store = null;
let vectorIndex = new Map();

function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function loadVectors() {
  vectorIndex = new Map();
  if (!fs.existsSync(VECTOR_FILE)) return;
  try {
    const raw = fs.readFileSync(VECTOR_FILE);
    const vecData = JSON.parse(raw.toString('utf8'));
    for (const [id, b64] of Object.entries(vecData)) {
      vectorIndex.set(id, Buffer.from(b64, 'base64'));
    }
    console.log(`[DB] Loaded ${vectorIndex.size} vectors from cache.`);
  } catch (e) {
    console.warn('[DB] Vector cache corrupted, ignoring.');
  }
}

function saveVectors() {
  const obj = {};
  for (const [id, buf] of vectorIndex.entries()) {
    obj[id] = buf.toString('base64');
  }
  fs.writeFileSync(VECTOR_FILE, JSON.stringify(obj));
}

function persist() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
    saveVectors();
  } catch (e) {
    console.error('[DB] Persist failed:', e);
    throw e;
  }
}

function getVectorBuf(versionId) {
  return vectorIndex.get(versionId) || null;
}

function setVectorBuf(versionId, buf) {
  if (buf) vectorIndex.set(versionId, Buffer.from(buf));
  else vectorIndex.delete(versionId);
}

export async function initDB() {
  if (store) return;
  loadVectors();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      store = JSON.parse(raw);
      console.log('[DB] Loaded existing JSON database.');
    } catch (e) {
      console.warn('[DB] JSON db corrupted, recreating.', e.message);
      store = null;
    }
  }
  if (!store) {
    console.log('[DB] Creating new JSON database.');
    store = {
      components: [],
      component_versions: [],
      articles: [],
      article_component_usages: [],
      meta: { created_at: nowISO(), version: 1 },
    };
    persist();
  }
  console.log('[DB] Initialized.');
}

// ----- Query helpers (simple filter / sort) -----

function matchesFilter(obj, where) {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (obj[k] !== v) return false;
  }
  return true;
}

export function queryAll(table, where = null, orderBy = null, limit = null) {
  if (!store) throw new Error('DB not initialized');
  const rows = store[table] || [];
  let result = where ? rows.filter(r => matchesFilter(r, where)) : rows.slice();
  if (orderBy) {
    const [col, dir = 'asc'] = Array.isArray(orderBy) ? orderBy : [orderBy, 'asc'];
    result.sort((a, b) => {
      if (a[col] < b[col]) return dir === 'asc' ? -1 : 1;
      if (a[col] > b[col]) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  if (limit) result = result.slice(0, limit);
  // Attach semantic_vector from vectorIndex for component_versions
  if (table === 'component_versions') {
    result = result.map(r => ({ ...r, semantic_vector: getVectorBuf(r.id) }));
  }
  return result;
}

export function queryOne(table, where = null) {
  const rows = queryAll(table, where);
  return rows[0] || null;
}

export function insert(table, row) {
  if (!store) throw new Error('DB not initialized');
  if (!store[table]) store[table] = [];
  const withTs = { created_at: nowISO(), ...row };
  // For component_versions, extract semantic_vector to vectorIndex
  if (table === 'component_versions' && withTs.semantic_vector != null) {
    setVectorBuf(withTs.id, withTs.semantic_vector);
    const { semantic_vector, ...rest } = withTs;
    store[table].push(rest);
  } else {
    store[table].push(withTs);
  }
  persist();
  return withTs;
}

export function update(table, where, updates) {
  if (!store) throw new Error('DB not initialized');
  let count = 0;
  const rows = store[table] || [];
  for (let i = 0; i < rows.length; i++) {
    if (matchesFilter(rows[i], where)) {
      rows[i] = { ...rows[i], ...updates, updated_at: nowISO() };
      // Handle semantic_vector specially
      if (table === 'component_versions' && updates.semantic_vector !== undefined) {
        setVectorBuf(rows[i].id, updates.semantic_vector);
        delete rows[i].semantic_vector;
      }
      count++;
    }
  }
  if (count > 0) persist();
  return count;
}

export function remove(table, where) {
  if (!store) throw new Error('DB not initialized');
  const before = (store[table] || []).length;
  store[table] = (store[table] || []).filter(r => !matchesFilter(r, where));
  if (table === 'component_versions') {
    // Clean up vectors
    for (const r of (store[table] || [])) {/* leftover */}
  }
  const removed = before - (store[table] || []).length;
  if (removed > 0) persist();
  return removed;
}

// ----- Join helpers -----

export function queryActiveVersionsWithComponent() {
  const versions = queryAll('component_versions', { is_active: 1 });
  return versions.map(v => {
    const comp = queryOne('components', { id: v.component_id });
    let labels = [];
    if (comp?.labels) {
      try { labels = JSON.parse(comp.labels); } catch { labels = []; }
    }
    return {
      version_id: v.id,
      component_id: v.component_id,
      semantic_vector: v.semantic_vector,
      version: v.version,
      source_code: v.source_code,
      changelog: v.changelog,
      name: comp?.name,
      semantic_description: comp?.semantic_description,
      category: comp?.category,
      props_schema: comp?.props_schema,
      labels,
    };
  });
}

export function getComponentWithVersions(id) {
  const comp = queryOne('components', { id });
  if (!comp) return null;
  const versions = queryAll('component_versions', { component_id: id }, [['created_at', 'desc']]);
  return { ...comp, versions };
}

export function getArticleWithUsages(id) {
  const art = queryOne('articles', { id });
  if (!art) return null;
  const usages = queryAll('article_component_usages', { article_id: id }, ['layout_order', 'asc']);
  return { ...art, usages };
}

// ----- Transaction (no-op for JSON, but keep API compat) -----
export function transaction(fn) {
  const result = fn();
  persist();
  return result;
}

// ----- Old createQueryWrapper compat (minimal, used by seed only if we refactor) -----
export function createQueryWrapper() {
  return () => ({
    all: () => [],
    get: () => undefined,
    run: () => {},
  });
}

export function getStore() { return store; }
export { persist as persistDB };

export default {
  initDB,
  queryAll,
  queryOne,
  insert,
  update,
  remove,
  queryActiveVersionsWithComponent,
  getComponentWithVersions,
  getArticleWithUsages,
  transaction,
};
