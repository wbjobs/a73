const CLASSIFY_TIMEOUT_MS = 1500;

const LABELS = [
  { id: 'news',       name: '新闻类',   color: '#3b82f6' },
  { id: 'tech',       name: '技术类',   color: '#8b5cf6' },
  { id: 'review',     name: '评测类',   color: '#f59e0b' },
  { id: 'report',     name: '报道类',   color: '#10b981' },
  { id: 'tutorial',   name: '教程类',   color: '#ec4899' },
  { id: 'has_timeline', name: '带时间线', color: '#6366f1' },
  { id: 'has_image',   name: '带图片',   color: '#f97316' },
  { id: 'has_code',    name: '带代码',   color: '#14b8a6' },
  { id: 'has_table',   name: '带表格',   color: '#a855f7' },
  { id: 'has_chart',   name: '带图表',   color: '#06b6d4' },
  { id: 'has_video',   name: '带视频',   color: '#ef4444' },
  { id: 'has_quote',   name: '带引用',   color: '#84cc16' },
  { id: 'has_gallery', name: '带图集',   color: '#e879f9' },
  { id: 'has_list',    name: '带列表',   color: '#fbbf24' },
  { id: 'has_header',  name: '带页头',   color: '#64748b' },
];

const SYNONYM_GROUPS = [
  { label: 'has_table', words: ['表格', '表单', '数据表', '统计表', '报表', '列表格'] },
  { label: 'has_chart', words: ['图表', '走势图', '折线图', '柱状图', '饼图', '可视化', '数据图', '统计图', '曲线图'] },
  { label: 'has_timeline', words: ['时间线', '时间轴', '里程碑', '时间节点', '历程', '发展过程', '按时间', '时间顺序', '步骤', '过程'] },
  { label: 'has_image', words: ['图片', '图像', '照片', '配图', '图注', '插图', '截图', '示意图'] },
  { label: 'has_code', words: ['代码', '代码块', '程序', '编程', '语法', '函数', 'javascript', 'python', '源码', '代码示例', '片段'] },
  { label: 'has_video', words: ['视频', '播放器', '演示', '发布会', '录像', '视频嵌入', '短片'] },
  { label: 'has_quote', words: ['引用', '引言', '金句', '专家', '观点', '名人', '语录', '原话'] },
  { label: 'has_gallery', words: ['画廊', '图集', '组图', '相册', '多图', '图库', '图展'] },
  { label: 'has_list', words: ['要点', '列表', '清单', '核心', '关键', '摘要', '总结', '概要', '一览'] },
  { label: 'has_header', words: ['标题', '页头', '头图', '眉毛', '栏目', '副标题', '导航'] },
  { label: 'news', words: ['新闻', '资讯', '报道', '快讯', '消息', '动态', '通讯'] },
  { label: 'tech', words: ['科技', '技术', '编程', 'AI', '人工智能', '算法', '架构', '工程', '开发'] },
  { label: 'review', words: ['评测', '测评', '评价', '对比', '横评', '体验', '测试', '评分', '打分'] },
  { label: 'report', words: ['报道', '发布', '发布会', '现场', '直播', '官宣', '声明'] },
  { label: 'tutorial', words: ['教程', '指南', '入门', '教学', '步骤', '如何', '方法', '实践', '手把手'] },
];

const LABEL_RULES = [];
for (const group of SYNONYM_GROUPS) {
  for (const word of group.words) {
    LABEL_RULES.push({ word, label: group.label });
  }
}
LABEL_RULES.sort((a, b) => b.word.length - a.word.length);

function classifyByKeywords(text) {
  const lower = text.toLowerCase();
  const matched = new Map();

  for (const rule of LABEL_RULES) {
    if (lower.includes(rule.word)) {
      const existing = matched.get(rule.label) || 0;
      matched.set(rule.label, Math.max(existing, rule.word.length));
    }
  }

  const labels = [];
  for (const [labelId, strength] of matched.entries()) {
    const def = LABELS.find(l => l.id === labelId);
    if (def) {
      labels.push({
        id: labelId,
        name: def.name,
        confidence: Math.min(1.0, strength / 4 + 0.4),
        source: 'keyword',
      });
    }
  }

  if (labels.length === 0) {
    labels.push(
      { id: 'news', name: '新闻类', confidence: 0.3, source: 'fallback' },
      { id: 'has_header', name: '带页头', confidence: 0.3, source: 'fallback' },
      { id: 'has_image', name: '带图片', confidence: 0.25, source: 'fallback' },
    );
  }

  return labels;
}

let classifierFn = null;
let classifierLoadAttempted = false;

async function loadClassifier() {
  if (classifierFn) return classifierFn;
  if (classifierLoadAttempted) return null;
  classifierLoadAttempted = true;

  try {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    env.remoteHost = 'https://hf-mirror.com';
    env.remotePathTemplate = '{model}/resolve/{revision}/{file}';
    env.fetchOptions = { timeout: 10000 };

    console.log('[Classifier] Loading zero-shot classifier model...');
    const classifier = await pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', {
      quantized: true,
    });
    classifierFn = classifier;
    console.log('[Classifier] Zero-shot classifier loaded.');
    return classifierFn;
  } catch (e) {
    console.warn('[Classifier] Failed to load classifier model, keyword-only mode.', e.message?.split('\n')[0]);
    return null;
  }
}

async function classifyWithModel(text, candidateLabels) {
  const classifier = await loadClassifier();
  if (!classifier) return null;

  const labelStrings = candidateLabels.map(l => l.name);
  const result = await classifier(text, labelStrings, { multi_label: true });

  const labels = [];
  for (let i = 0; i < result.labels.length; i++) {
    if (result.scores[i] >= 0.3) {
      const def = LABELS.find(l => l.name === result.labels[i]);
      if (def) {
        labels.push({
          id: def.id,
          name: def.name,
          confidence: parseFloat(result.scores[i].toFixed(4)),
          source: 'model',
        });
      }
    }
  }
  return labels;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function classifyIntent(text) {
  const keywordLabels = classifyByKeywords(text);
  const keywordLabelIds = new Set(keywordLabels.map(l => l.id));

  let modelLabels = null;
  let usedSource = 'keyword';
  let modelTimedOut = false;

  try {
    modelLabels = await withTimeout(
      classifyWithModel(text, LABELS),
      CLASSIFY_TIMEOUT_MS
    );
    if (modelLabels && modelLabels.length > 0) {
      usedSource = 'model+keyword';
    }
  } catch (e) {
    modelTimedOut = true;
    console.log('[Classifier] Model timeout or error, using keyword rules only.', e.message?.slice(0, 60));
  }

  if (usedSource === 'model+keyword' && modelLabels) {
    const merged = new Map();

    for (const kl of keywordLabels) {
      merged.set(kl.id, { ...kl, confidence: Math.min(1.0, kl.confidence + 0.15), source: 'keyword' });
    }
    for (const ml of modelLabels) {
      const existing = merged.get(ml.id);
      if (existing) {
        existing.confidence = Math.min(1.0, existing.confidence + ml.confidence * 0.3);
        existing.source = 'model+keyword';
      } else if (ml.confidence >= 0.4) {
        merged.set(ml.id, { ...ml, source: 'model' });
      }
    }

    return {
      labels: Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence),
      source: usedSource,
      modelTimedOut: false,
    };
  }

  return {
    labels: keywordLabels.sort((a, b) => b.confidence - a.confidence),
    source: 'keyword',
    modelTimedOut,
  };
}

export function getComponentLabels(componentName, componentCategory, componentDesc) {
  const labels = new Set();
  const n = componentName.toLowerCase();
  const d = (componentDesc || '').toLowerCase();
  const c = (componentCategory || '').toLowerCase();

  if (c.includes('layout') || c.includes('结构') || c.includes('容器')) labels.add('has_header');
  if (n.includes('header') || n.includes('页头') || d.includes('标题') || d.includes('页头')) labels.add('has_header');
  if (n.includes('timeline') || n.includes('时间线') || d.includes('时间线') || d.includes('时间轴') || d.includes('历程')) labels.add('has_timeline');
  if (n.includes('image') && !n.includes('gallery') || (d.includes('单张图片') || d.includes('配图'))) {
    if (!n.includes('gallery')) labels.add('has_image');
  }
  if (n.includes('gallery') || n.includes('画廊') || d.includes('画廊') || d.includes('图集') || d.includes('多图')) labels.add('has_gallery');
  if (n.includes('code') || n.includes('代码') || d.includes('代码') || d.includes('代码块') || d.includes('程序')) labels.add('has_code');
  if (n.includes('video') || n.includes('视频') || d.includes('视频') || d.includes('播放器')) labels.add('has_video');
  if (n.includes('quote') || n.includes('引用') || d.includes('引用') || d.includes('引言') || d.includes('专家')) labels.add('has_quote');
  if (n.includes('list') || n.includes('要点') || d.includes('要点') || d.includes('列表') || d.includes('清单')) labels.add('has_list');
  if (n.includes('news') || n.includes('新闻') || n.includes('card') || d.includes('新闻') || d.includes('资讯')) { labels.add('news'); labels.add('has_header'); }
  if (n.includes('rich') || n.includes('段落') || n.includes('paragraph') || d.includes('正文') || d.includes('段落')) labels.add('has_header');
  if (d.includes('科技') || d.includes('技术')) labels.add('tech');
  if (d.includes('评测') || d.includes('产品')) labels.add('review');
  if (d.includes('发布') || d.includes('演示')) labels.add('report');
  if (d.includes('教程') || d.includes('教学')) labels.add('tutorial');

  if (labels.size === 0) labels.add('has_header');

  return Array.from(labels);
}

const LABEL_RELATED = {
  has_table:   ['has_list', 'has_image', 'has_header'],
  has_chart:   ['has_image', 'has_gallery', 'has_list'],
  has_timeline: ['has_list', 'has_header'],
  has_gallery: ['has_image'],
  has_video:   ['has_image'],
  has_code:    ['has_list', 'tech'],
  has_quote:   ['has_header', 'news'],
  has_list:    ['has_header'],
  has_image:   ['has_gallery'],
  has_header:  ['news'],
  news:        ['has_header', 'report'],
  tech:        ['has_code', 'has_header'],
  review:      ['has_image', 'has_gallery', 'has_list'],
  report:      ['has_video', 'has_header', 'news'],
  tutorial:    ['has_code', 'has_timeline', 'has_list'],
};

export function matchLabels(intentLabels, componentLabels) {
  if (!intentLabels || intentLabels.length === 0) return 0;
  if (!componentLabels || componentLabels.length === 0) return 0;

  const compSet = new Set(componentLabels);
  let matched = 0;
  let totalWeight = 0;

  for (const il of intentLabels) {
    const weight = il.confidence;
    totalWeight += weight;

    if (compSet.has(il.id)) {
      matched += weight;
    } else {
      const related = LABEL_RELATED[il.id] || [];
      for (const relLabel of related) {
        if (compSet.has(relLabel)) {
          matched += weight * 0.5;
          break;
        }
      }
    }
  }

  return totalWeight > 0 ? matched / totalWeight : 0;
}

export { LABELS, CLASSIFY_TIMEOUT_MS };
