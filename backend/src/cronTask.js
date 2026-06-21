import cron from 'node-cron';
import { queryAll, update } from './db.js';
import { getComponentLabels, LABELS } from './intentClassifier.js';

const CRON_EXPRESSION = '0 0 0 * * *';

let isRunning = false;

function parseJsonOrEmpty(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

export async function runIncrementalTraining() {
  if (isRunning) {
    console.log('[Cron] Training already in progress, skipping.');
    return;
  }
  isRunning = true;
  const t0 = Date.now();

  try {
    console.log(`\n[Cron] ========== Starting incremental training cycle at ${new Date().toISOString()} ==========`);

    const unprocessed = queryAll('component_feedback', { is_processed: 0 }, [['created_at', 'asc']]);
    if (unprocessed.length === 0) {
      console.log('[Cron] No unprocessed feedback, skipping training.');
      return { processed: 0 };
    }
    console.log(`[Cron] Found ${unprocessed.length} unprocessed feedback samples.`);

    const componentLabelBoost = new Map();
    const componentLabelSuppress = new Map();
    let processedCount = 0;

    for (const fb of unprocessed) {
      const weight = fb.weight || 1.0;
      const originalLayout = parseJsonOrEmpty(fb.original_layout);
      const adjustedLayout = parseJsonOrEmpty(fb.adjusted_layout);
      const changes = parseJsonOrEmpty(fb.changes);

      if (!changes || (!changes.added && !changes.removed && !changes.reordered)) {
        update('component_feedback', { id: fb.id }, { is_processed: 1, processed_at: new Date().toISOString() });
        processedCount++;
        continue;
      }

      const originalCompIds = new Set(originalLayout.map(n => n.component_id));
      const adjustedCompIds = new Set(adjustedLayout.map(n => n.component_id));

      for (const added of changes.added || []) {
        const cid = added.component_id;
        boostLabel(componentLabelBoost, cid, 'added', weight * 1.2);
      }
      for (const removed of changes.removed || []) {
        const cid = removed.component_id;
        boostLabel(componentLabelSuppress, cid, 'removed', weight * 1.2);
      }
      for (const reordered of changes.reordered || []) {
        const cid = reordered.component_id;
        if (reordered.new_order < reordered.original_order) {
          boostLabel(componentLabelBoost, cid, 'promoted', weight * 0.8);
        } else {
          boostLabel(componentLabelSuppress, cid, 'demoted', weight * 0.8);
        }
      }

      update('component_feedback', { id: fb.id }, {
        is_processed: 1,
        processed_at: new Date().toISOString(),
        training_result: JSON.stringify({
          boosted: componentLabelBoost.get(fb.id) || {},
          suppressed: componentLabelSuppress.get(fb.id) || {},
        }),
      });
      processedCount++;
    }

    console.log(`[Cron] Aggregated signals: ${componentLabelBoost.size} boosted, ${componentLabelSuppress.size} suppressed`);

    console.log('\n[Cron] ---------- Training Summary ----------');
    for (const [cid, data] of componentLabelBoost.entries()) {
      console.log(`[Cron]   COMPONENT ${cid}: boosted labels=` +
        Object.entries(data).filter(([k, v]) => v > 0.1).map(([k, v]) => k + '=' + v.toFixed(2)).join(', '));
    }

    const elapsed = Date.now() - t0;
    console.log(`[Cron] ========== Training complete. Processed ${processedCount}/${unprocessed.length} samples in ${elapsed}ms ==========\n`);

    return {
      processed: processedCount,
      total: unprocessed.length,
      elapsed_ms: elapsed,
      boosted_components: componentLabelBoost.size,
      suppressed_components: componentLabelSuppress.size,
    };
  } catch (e) {
    console.error('[Cron] Training failed:', e);
    throw e;
  } finally {
    isRunning = false;
  }
}

function boostLabel(map, componentId, reason, weight) {
  if (!map.has(componentId)) map.set(componentId, {});
  const comp = map.get(componentId);
  comp[reason] = (comp[reason] || 0) + weight;
}

export function initCronJob() {
  console.log(`[Cron] Scheduled incremental training: "${CRON_EXPRESSION}" (daily at midnight)`);
  const task = cron.schedule(CRON_EXPRESSION, () => {
    runIncrementalTraining().catch(e => console.error('[Cron] Unhandled error:', e));
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  return {
    task,
    runNow: () => runIncrementalTraining(),
    getStatus: () => ({ isRunning, scheduled: task.getStatus() === 'scheduled' }),
  };
}

export { CRON_EXPRESSION };
