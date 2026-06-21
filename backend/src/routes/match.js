import { Router } from 'express';
import { queryActiveVersionsWithComponent } from '../db.js';
import { getEmbedding, bufferToVector, cosineSimilarity } from '../semantic.js';
import { classifyIntent, matchLabels, LABELS } from '../intentClassifier.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { intent_description, top_k = 3 } = req.body;
    if (!intent_description) return res.status(400).json({ error: 'intent_description is required' });

    const t0 = Date.now();
    console.log('[Match] === NEW THREE-STAGE MATCHING ===');
    console.log('[Match] Intent:', intent_description.slice(0, 60) + '...');

    // ---- Stage 1: Intent Classification (multi-label) ----
    const classifyResult = await classifyIntent(intent_description);
    const intentLabels = classifyResult.labels;
    const classifySource = classifyResult.source;
    const modelTimedOut = classifyResult.modelTimedOut;
    console.log('[Match] Stage 1 - Classification:', intentLabels.map(l => `${l.name}(${l.confidence.toFixed(2)})`).join(', '),
      '| source:', classifySource, '| timedOut:', modelTimedOut);

    // ---- Stage 2: Label-based filtering ----
    const activeVersions = queryActiveVersionsWithComponent();
    console.log('[Match] Stage 2 - Total active versions:', activeVersions.length);

    if (activeVersions.length === 0) return res.json({ matches: [], layout: [], classification: classifyResult });

    const labelScored = [];
    for (const row of activeVersions) {
      const labelMatchScore = matchLabels(intentLabels, row.labels || []);
      labelScored.push({
        component_id: row.component_id,
        component_version_id: row.version_id,
        version: row.version,
        name: row.name,
        category: row.category,
        semantic_description: row.semantic_description,
        source_code: row.source_code,
        props_schema: row.props_schema ? JSON.parse(row.props_schema) : null,
        labels: row.labels || [],
        label_match_score: parseFloat(labelMatchScore.toFixed(4)),
      });
    }

    const CANDIDATE_THRESHOLD = 0.2;
    let candidates = labelScored.filter(c => c.label_match_score >= CANDIDATE_THRESHOLD);
    if (candidates.length === 0) candidates = labelScored.slice();

    console.log('[Match] Stage 2 - Label-filtered candidates:', candidates.length, '/',
      labelScored.length, '(threshold:', CANDIDATE_THRESHOLD + ')');
    for (const c of candidates.slice(0, 5)) {
      console.log('[Match]   ', c.name, 'labelScore=', c.label_match_score,
        'labels=[', (c.labels || []).join(','), ']');
    }

    // ---- Stage 3: Cosine similarity ranking among candidates ----
    const intentVec = await getEmbedding(intent_description);
    console.log('[Match] Stage 3 - Computing embeddings, dim=', intentVec.length);

    for (const c of candidates) {
      const av = activeVersions.find(av => av.version_id === c.component_version_id);
      const rawVec = av ? av.semantic_vector : null;
      const compVec = bufferToVector(rawVec);
      if (!compVec) {
        console.warn('[Match] WARNING: No vector for', c.name, c.component_version_id);
        c.cosine_score = 0;
      } else {
        c.cosine_score = parseFloat(cosineSimilarity(intentVec, compVec).toFixed(4));
      }
    }

    const LABEL_WEIGHT = 0.55;
    const COSINE_WEIGHT = 0.45;
    for (const c of candidates) {
      const ls = c.label_match_score || 0;
      const cs = c.cosine_score || 0;
      c.combined_score = parseFloat(
        (LABEL_WEIGHT * ls + COSINE_WEIGHT * cs).toFixed(4)
      );
    }

    candidates.sort((a, b) => b.combined_score - a.combined_score);
    const topK = candidates.slice(0, Math.min(top_k, candidates.length));
    for (const m of topK) {
      m.match_score = m.combined_score;
      m.matched_labels = findMatchedLabels(m.labels || [], intentLabels || []);
    }

    console.log('[Match] Final Top-K:');
    for (const m of topK) {
      console.log('[Match]   ', m.name,
        'combined=', m.combined_score,
        'label=', m.label_match_score,
        'cosine=', m.cosine_score,
        'labels=[', (m.labels || []).join(','), ']');
    }

    const layout = buildLayout(topK, intent_description, intentLabels);
    const elapsed = Date.now() - t0;
    console.log('[Match] Total matching time:', elapsed, 'ms');

    const allCosineScores = labelScored.map(c => {
      const compVec = bufferToVector(activeVersions.find(av => av.version_id === c.component_version_id)?.semantic_vector);
      return cosineSimilarity(intentVec, compVec);
    });

    res.json({
      matches: topK,
      layout,
      classification: {
        labels: intentLabels,
        source: classifySource,
        model_timed_out: modelTimedOut,
      },
      debug: {
        total_considered: labelScored.length,
        label_filtered_count: candidates.length,
        score_range: allCosineScores.length ? [
          parseFloat(Math.min(...allCosineScores).toFixed(4)),
          parseFloat(Math.max(...allCosineScores).toFixed(4)),
        ] : null,
        label_weight: LABEL_WEIGHT,
        cosine_weight: COSINE_WEIGHT,
        elapsed_ms: elapsed,
      },
    });
  } catch (e) {
    console.error('[Match ERROR]', e);
    res.status(500).json({ error: e.message });
  }
});

function buildLayout(topK, intent, intentLabels) {
  const layout = [];
  const categories = { layout: [], content: [], media: [], interactive: [] };
  for (const m of topK) {
    const cat = (m.category || 'content').toLowerCase();
    if (cat.includes('layout') || cat.includes('结构') || cat.includes('容器')) categories.layout.push(m);
    else if (cat.includes('media') || cat.includes('image') || cat.includes('图片') || cat.includes('视频')) categories.media.push(m);
    else if (cat.includes('interactive') || cat.includes('代码') || cat.includes('code')) categories.interactive.push(m);
    else categories.content.push(m);
  }

  const usedIds = new Set();
  let order = 0;

  function addUnique(list) {
    for (const m of list) {
      if (usedIds.has(m.component_id)) continue;
      usedIds.add(m.component_id);
      layout.push(makeNode(m, order++, intent, intentLabels));
    }
  }

  addUnique(categories.layout);
  addUnique(categories.media);
  addUnique(categories.content);
  addUnique(categories.interactive);

  if (layout.length === 0) {
    for (const m of topK) layout.push(makeNode(m, order++, intent, intentLabels));
  }
  return layout;
}

function makeNode(match, order, intent, intentLabels) {
  return {
    id: `node_${match.component_id}_${Date.now()}_${order}_${Math.random().toString(36).slice(2, 6)}`,
    component_id: match.component_id,
    component_version_id: match.component_version_id,
    component_name: match.name,
    version: match.version,
    _source_code: match.source_code,
    match_score: match.combined_score,
    label_match_score: match.label_match_score,
    cosine_score: match.cosine_score,
    matched_labels: findMatchedLabels(match.labels || [], intentLabels || []),
    order,
    props: inferDefaultProps(match, intent),
  };
}

function findMatchedLabels(componentLabels, intentLabels) {
  if (!componentLabels || !intentLabels) return [];
  const intentIds = intentLabels.map(l => l.id);
  return componentLabels.filter(cl => intentIds.includes(cl));
}

function inferDefaultProps(match, intent) {
  const props = {};
  const name = match.name.toLowerCase();
  const intentLow = intent.toLowerCase();

  if (name.includes('title') || name.includes('标题')) { props.text = '文章标题'; props.level = 1; }
  else if (name.includes('timeline') || name.includes('时间线')) {
    props.items = [
      { time: '2024-01', title: '关键事件一', description: '此处填写事件详情' },
      { time: '2024-06', title: '关键事件二', description: '此处填写事件详情' },
      { time: '2025-01', title: '最新进展', description: '此处填写最新状态' },
    ];
  }
  else if (name.includes('image') && !name.includes('gallery')) {
    props.src = 'https://picsum.photos/800/450'; props.alt = '示例图片'; props.caption = '图片说明文字';
  }
  else if (name.includes('code') || name.includes('代码')) {
    props.language = 'javascript';
    props.code = `// 示例代码\nfunction hello() {\n  console.log("Hello, semantic CMS!");\n}\nhello();`;
  }
  else if (name.includes('paragraph') || name.includes('段落') || name.includes('rich')) {
    props.content = '此处为正文内容区域，编辑者可在此填写文章的详细正文内容。系统通过语义路由自动为您选择了最合适的内容组件。\n\n支持多段落排版，段落之间使用双换行分隔。';
  }
  else if (name.includes('news') || name.includes('新闻') || name.includes('card')) {
    props.title = '新闻标题';
    props.summary = '新闻摘要内容，突出重点信息';
    props.publishedAt = new Date().toISOString().slice(0, 10);
    props.tags = ['科技', '前沿'];
  }
  else if (name.includes('gallery') || name.includes('画廊')) {
    props.images = [
      { src: 'https://picsum.photos/400/300?1', alt: '图1' },
      { src: 'https://picsum.photos/400/300?2', alt: '图2' },
      { src: 'https://picsum.photos/400/300?3', alt: '图3' },
    ];
  }
  else if (name.includes('video') || name.includes('视频')) {
    props.url = 'https://www.w3schools.com/html/mov_bbb.mp4';
    props.poster = 'https://picsum.photos/640/360';
  }
  else if (name.includes('quote') || name.includes('引用')) {
    props.text = '这是一段引用的文字，用来突出重要的观点或引言。';
    props.author = '未知作者';
  }
  else if (name.includes('list') || name.includes('列表')) {
    props.items = ['要点一：核心创新', '要点二：技术突破', '要点三：应用场景'];
  }
  else if (name.includes('header') || name.includes('页头')) {
    props.eyebrow = intentLow.includes('科技') ? '科技前沿' : '最新资讯';
    props.title = '文章主标题';
    props.subtitle = '副标题或导读内容';
  }
  return props;
}

export default router;
