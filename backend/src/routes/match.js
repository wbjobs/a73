import { Router } from 'express';
import { queryActiveVersionsWithComponent } from '../db.js';
import { getEmbedding, bufferToVector, cosineSimilarity } from '../semantic.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { intent_description, top_k = 3 } = req.body;
    if (!intent_description) return res.status(400).json({ error: 'intent_description is required' });

    console.log('[Match] Computing embedding for intent:', intent_description.slice(0, 50) + '...');
    const t0 = Date.now();
    const intentVec = await getEmbedding(intent_description);
    console.log('[Match] Embedding computed in', Date.now() - t0, 'ms, dim=', intentVec.length);

    const activeVersions = queryActiveVersionsWithComponent();
    console.log('[Match] Scanning', activeVersions.length, 'active versions');

    if (activeVersions.length === 0) return res.json({ matches: [], layout: [] });

    const scored = [];
    for (const row of activeVersions) {
      const compVec = bufferToVector(row.semantic_vector);
      const score = cosineSimilarity(intentVec, compVec);
      scored.push({
        component_id: row.component_id,
        component_version_id: row.version_id,
        version: row.version,
        name: row.name,
        category: row.category,
        semantic_description: row.semantic_description,
        source_code: row.source_code,
        props_schema: row.props_schema ? JSON.parse(row.props_schema) : null,
        score: parseFloat(score.toFixed(4)),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, Math.min(top_k, scored.length));
    console.log('[Match] Top-K selected:', topK.map(m => `${m.name}=${m.score}`).join(', '));
    const layout = buildLayout(topK, intent_description);

    res.json({
      matches: topK,
      layout,
      debug: {
        total_considered: scored.length,
        score_range: scored.length ? [scored[scored.length - 1].score, scored[0].score] : null,
      },
    });
  } catch (e) {
    console.error('[Match ERROR]', e);
    res.status(500).json({ error: e.message });
  }
});

function buildLayout(topK, intent) {
  const layout = [];
  const categories = { layout: [], content: [], media: [], interactive: [] };
  for (const m of topK) {
    const cat = (m.category || 'content').toLowerCase();
    if (cat.includes('layout') || cat.includes('结构') || cat.includes('容器')) categories.layout.push(m);
    else if (cat.includes('media') || cat.includes('image') || cat.includes('图片') || cat.includes('视频')) categories.media.push(m);
    else if (cat.includes('interactive') || cat.includes('代码') || cat.includes('code')) categories.interactive.push(m);
    else categories.content.push(m);
  }

  let order = 0;
  if (categories.layout.length > 0) layout.push(makeNode(categories.layout[0], order++, intent));
  for (const m of categories.media) layout.push(makeNode(m, order++, intent));
  for (const m of categories.content) layout.push(makeNode(m, order++, intent));
  for (const m of categories.interactive) layout.push(makeNode(m, order++, intent));

  if (layout.length === 0) {
    for (const m of topK) layout.push(makeNode(m, order++, intent));
  }
  return layout;
}

function makeNode(match, order, intent) {
  return {
    id: `node_${match.component_id}_${Date.now()}_${order}_${Math.random().toString(36).slice(2, 6)}`,
    component_id: match.component_id,
    component_version_id: match.component_version_id,
    component_name: match.name,
    version: match.version,
    _source_code: match.source_code,
    match_score: match.score,
    order,
    props: inferDefaultProps(match, intent),
  };
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
