import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  queryAll, queryOne, insert, update, remove, transaction, getComponentWithVersions,
} from '../db.js';
import { getEmbedding, vectorToBuffer } from '../semantic.js';

const router = Router();

router.get('/', (req, res) => {
  const { category, activeOnly } = req.query;
  const where = {};
  if (category) where.category = category;

  const comps = queryAll('components', where, [['created_at', 'desc']]);
  const out = [];
  for (const c of comps) {
    const allVers = queryAll('component_versions', { component_id: c.id }, [['created_at', 'desc']]);
    const versions = activeOnly === 'true' ? allVers.filter(v => v.is_active === 1) : allVers;
    if (activeOnly === 'true' && versions.length === 0) continue;
    const active = versions.find(v => v.is_active === 1) || versions[0] || null;
    out.push({
      id: c.id,
      name: c.name,
      semantic_description: c.semantic_description,
      category: c.category,
      props_schema: c.props_schema ? JSON.parse(c.props_schema) : null,
      created_at: c.created_at,
      versions: versions.map(v => ({ id: v.id, version: v.version, is_active: !!v.is_active, changelog: v.changelog, created_at: v.created_at })),
      active_version: active ? { id: active.id, version: active.version, is_active: !!active.is_active, changelog: active.changelog, created_at: active.created_at } : null,
    });
  }
  res.json(out);
});

router.get('/:id', (req, res) => {
  const c = getComponentWithVersions(req.params.id);
  if (!c) return res.status(404).json({ error: 'Component not found' });
  c.props_schema = c.props_schema ? JSON.parse(c.props_schema) : null;
  c.versions = (c.versions || []).map(v => ({ ...v, is_active: !!v.is_active }));
  c.active_version = c.versions.find(v => v.is_active) || c.versions[0] || null;
  res.json(c);
});

router.post('/', async (req, res) => {
  try {
    const { name, semantic_description, category, props_schema, version, source_code, changelog } = req.body;
    if (!name || !semantic_description || !version || !source_code) {
      return res.status(400).json({ error: 'name, semantic_description, version, source_code are required' });
    }
    const componentId = uuidv4();
    const versionId = uuidv4();
    const vec = await getEmbedding(semantic_description);
    const vecBuf = vectorToBuffer(vec);

    transaction(() => {
      insert('components', {
        id: componentId,
        name,
        semantic_description,
        category: category || null,
        props_schema: props_schema ? JSON.stringify(props_schema) : null,
      });
      insert('component_versions', {
        id: versionId,
        component_id: componentId,
        version,
        source_code,
        semantic_vector: vecBuf,
        changelog: changelog || null,
        is_active: 1,
      });
    });

    res.status(201).json({ id: componentId, version_id: versionId, name, version });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/versions', async (req, res) => {
  try {
    const { version, source_code, changelog, semantic_description } = req.body;
    if (!version || !source_code) return res.status(400).json({ error: 'version and source_code are required' });
    const c = queryOne('components', { id: req.params.id });
    if (!c) return res.status(404).json({ error: 'Component not found' });

    const semDesc = semantic_description || c.semantic_description;
    const vec = await getEmbedding(semDesc);
    const vecBuf = vectorToBuffer(vec);
    const versionId = uuidv4();

    transaction(() => {
      update('component_versions', { component_id: c.id }, { is_active: 0 });
      insert('component_versions', {
        id: versionId,
        component_id: c.id,
        version,
        source_code,
        semantic_vector: vecBuf,
        changelog: changelog || null,
        is_active: 1,
      });
      if (semantic_description) {
        update('components', { id: c.id }, { semantic_description });
      }
    });

    res.status(201).json({ id: versionId, version });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/versions/:vid/activate', (req, res) => {
  const c = queryOne('components', { id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Component not found' });
  const v = queryOne('component_versions', { id: req.params.vid, component_id: c.id });
  if (!v) return res.status(404).json({ error: 'Version not found' });
  transaction(() => {
    update('component_versions', { component_id: c.id }, { is_active: 0 });
    update('component_versions', { id: v.id }, { is_active: 1 });
  });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  remove('component_versions', { component_id: req.params.id });
  remove('components', { id: req.params.id });
  res.json({ ok: true });
});

export default router;
