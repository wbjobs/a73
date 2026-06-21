import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, insert, update } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { limit = 50, processed } = req.query;
    const where = processed !== undefined ? { is_processed: parseInt(processed) } : null;
    const feedbacks = queryAll('component_feedback', where, [['created_at', 'desc']], parseInt(limit));
    res.json(feedbacks);
  } catch (e) {
    console.error('[Feedback GET Error]', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      intent_description,
      original_layout,
      adjusted_layout,
      original_matches,
      intervention_type,
      session_id,
      article_id,
    } = req.body;

    if (!intent_description || !adjusted_layout) {
      return res.status(400).json({ error: 'intent_description and adjusted_layout are required' });
    }

    let changes = null;
    if (original_layout && Array.isArray(original_layout) && Array.isArray(adjusted_layout)) {
      changes = analyzeChanges(original_layout, adjusted_layout);
    }

    const fid = uuidv4();
    const record = insert('component_feedback', {
      id: fid,
      intent_description,
      original_layout: JSON.stringify(original_layout || []),
      adjusted_layout: JSON.stringify(adjusted_layout),
      original_matches: JSON.stringify(original_matches || []),
      intervention_type: intervention_type || 'manual_adjust',
      changes: JSON.stringify(changes),
      session_id: session_id || null,
      article_id: article_id || null,
      is_processed: 0,
      weight: calculateWeight(intervention_type, changes),
    });

    console.log(`[Feedback] Recorded ${intervention_type || 'manual_adjust'}: ${fid.slice(0, 8)}.. intent="${intent_description.slice(0, 40)}" weight=${record.weight}`);
    if (changes) {
      console.log(`[Feedback]   Changes: added=${changes.added.length} removed=${changes.removed.length} reordered=${changes.reordered.length}`);
    }

    res.json({
      success: true,
      id: fid,
      changes,
      message: 'Feedback recorded, will be used in next incremental training cycle.',
    });
  } catch (e) {
    console.error('[Feedback POST Error]', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/processed', async (req, res) => {
  try {
    const { id } = req.params;
    const { training_result } = req.body;
    const count = update('component_feedback', { id }, {
      is_processed: 1,
      processed_at: new Date().toISOString(),
      training_result: training_result ? JSON.stringify(training_result) : null,
    });
    if (count === 0) return res.status(404).json({ error: 'Feedback not found' });
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function analyzeChanges(original, adjusted) {
  const origIds = original.map(n => n.component_id || n.id);
  const adjIds = adjusted.map(n => n.component_id || n.id);

  const added = adjusted.filter(n => !origIds.includes(n.component_id || n.id)).map(n => ({
    component_id: n.component_id, component_name: n.component_name, new_order: n.order || adjusted.indexOf(n),
  }));
  const removed = original.filter(n => !adjIds.includes(n.component_id || n.id)).map(n => ({
    component_id: n.component_id, component_name: n.component_name, original_order: n.order || original.indexOf(n),
  }));

  const origOrderMap = new Map(original.map((n, i) => [n.component_id || n.id, i]));
  const adjOrderMap = new Map(adjusted.map((n, i) => [n.component_id || n.id, i]));
  const reordered = [];
  for (const id of adjIds) {
    if (origOrderMap.has(id) && origOrderMap.get(id) !== adjOrderMap.get(id)) {
      const comp = adjusted.find(n => (n.component_id || n.id) === id);
      reordered.push({
        component_id: id,
        component_name: comp?.component_name,
        original_order: origOrderMap.get(id),
        new_order: adjOrderMap.get(id),
      });
    }
  }

  return { added, removed, reordered };
}

function calculateWeight(type, changes) {
  let weight = 1.0;
  if (type === 'explicit_save' || type === 'article_publish') weight = 1.5;
  if (type === 'drag_reorder') weight = 1.2;
  if (changes) {
    weight += (changes.added.length + changes.removed.length) * 0.15;
    weight += changes.reordered.length * 0.08;
  }
  return parseFloat(Math.min(weight, 3.0).toFixed(2));
}

export default router;
