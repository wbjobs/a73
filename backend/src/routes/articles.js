import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  queryAll, queryOne, insert, update, remove, transaction,
} from '../db.js';

const router = Router();

function attachUsagesToArticle(articleId) {
  const usagesRaw = queryAll('article_component_usages', { article_id: articleId }, [['layout_order', 'asc']]);
  return usagesRaw.map(u => {
    const comp = queryOne('components', { id: u.component_id });
    const ver = queryOne('component_versions', { id: u.component_version_id });
    return {
      ...u,
      assigned_props: u.assigned_props ? JSON.parse(u.assigned_props) : null,
      name: comp?.name,
      category: comp?.category,
      version: ver?.version,
      source_code: ver?.source_code,
    };
  });
}

router.get('/', (req, res) => {
  const { status } = req.query;
  const where = status ? { status } : null;
  const rows = queryAll('articles', where, [['updated_at', 'desc']]).map(r => ({
    ...r,
    layout_json: r.layout_json ? JSON.parse(r.layout_json) : null,
    content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
    component_count: queryAll('article_component_usages', { article_id: r.id }).length,
  }));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const a = queryOne('articles', { id: req.params.id });
  if (!a) return res.status(404).json({ error: 'Article not found' });
  a.layout_json = a.layout_json ? JSON.parse(a.layout_json) : null;
  a.content = typeof a.content === 'string' ? JSON.parse(a.content) : a.content;
  a.component_usages = attachUsagesToArticle(a.id);
  res.json(a);
});

router.post('/', (req, res) => {
  try {
    const { title, intent_description, content, layout, status = 'draft' } = req.body;
    if (!title || !intent_description || !content) return res.status(400).json({ error: 'title, intent_description, content are required' });
    const articleId = uuidv4();

    transaction(() => {
      insert('articles', {
        id: articleId,
        title,
        intent_description,
        content: JSON.stringify(content),
        layout_json: layout ? JSON.stringify(layout) : null,
        status,
      });

      if (layout && Array.isArray(layout)) {
        for (const node of layout) {
          if (node.component_id && node.component_version_id) {
            insert('article_component_usages', {
              id: uuidv4(),
              article_id: articleId,
              component_id: node.component_id,
              component_version_id: node.component_version_id,
              match_score: node.match_score || 0,
              layout_order: node.order ?? 0,
              assigned_props: node.props ? JSON.stringify(node.props) : null,
            });
          }
        }
      }
    });

    res.status(201).json({ id: articleId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const a = queryOne('articles', { id: req.params.id });
    if (!a) return res.status(404).json({ error: 'Article not found' });
    const { title, intent_description, content, layout, status } = req.body;

    transaction(() => {
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (intent_description !== undefined) updates.intent_description = intent_description;
      if (content !== undefined) updates.content = JSON.stringify(content);
      if (layout !== undefined) updates.layout_json = layout ? JSON.stringify(layout) : null;
      if (status !== undefined) updates.status = status;
      update('articles', { id: a.id }, updates);

      if (layout && Array.isArray(layout)) {
        remove('article_component_usages', { article_id: a.id });
        for (const node of layout) {
          if (node.component_id && node.component_version_id) {
            insert('article_component_usages', {
              id: uuidv4(),
              article_id: a.id,
              component_id: node.component_id,
              component_version_id: node.component_version_id,
              match_score: node.match_score || 0,
              layout_order: node.order ?? 0,
              assigned_props: node.props ? JSON.stringify(node.props) : null,
            });
          }
        }
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  remove('article_component_usages', { article_id: req.params.id });
  remove('articles', { id: req.params.id });
  res.json({ ok: true });
});

router.get('/:id/render', (req, res) => {
  const a = queryOne('articles', { id: req.params.id });
  if (!a) return res.status(404).json({ error: 'Article not found' });
  const layout = a.layout_json ? JSON.parse(a.layout_json) : [];
  const nodes = [];
  for (const node of layout) {
    const ver = queryOne('component_versions', { id: node.component_version_id });
    if (ver) {
      const comp = queryOne('components', { id: ver.component_id });
      nodes.push({
        ...node,
        component: {
          id: ver.component_id,
          name: comp?.name,
          category: comp?.category,
          version: ver.version,
          source_code: ver.source_code,
        },
      });
    }
  }
  res.json({
    article: { id: a.id, title: a.title, intent_description: a.intent_description, status: a.status },
    nodes,
  });
});

export default router;
