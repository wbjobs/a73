import { initDB, insert, queryAll } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { getEmbedding, vectorToBuffer } from './semantic.js';

const COMPONENTS = [
  {
    name: 'ArticleHeader', category: 'layout',
    semantic_description: '文章页头组件 标题 副标题 栏目标签 眉毛导航 科技新闻开头头图区域',
    source: `function ArticleHeader({ eyebrow, title, subtitle }) {
  return React.createElement('header', { style: { borderBottom: '1px solid #e5e7eb', padding: '32px 0', marginBottom: '24px' } },
    eyebrow && React.createElement('div', { style: { color: '#2563eb', fontSize: '14px', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em' } }, eyebrow),
    React.createElement('h1', { style: { fontSize: '36px', fontWeight: 800, color: '#111827', margin: '0 0 12px 0', lineHeight: 1.2 } }, title),
    subtitle && React.createElement('p', { style: { fontSize: '18px', color: '#6b7280', margin: 0, lineHeight: 1.6 } }, subtitle)
  );
}`
  },
  {
    name: 'Timeline', category: 'layout',
    semantic_description: '时间线组件 科技新闻发展历程 时间节点 里程碑 事件时间轴按时间顺序展示',
    source: `function Timeline({ items = [] }) {
  return React.createElement('div', { style: { margin: '24px 0', padding: '16px 0' } },
    React.createElement('div', { style: { fontSize: '14px', color: '#6b7280', marginBottom: '16px', fontWeight: 600 } }, '⏱ 事件时间线'),
    React.createElement('div', { style: { position: 'relative', paddingLeft: '28px' } },
      React.createElement('div', { style: { position: 'absolute', left: '7px', top: '4px', bottom: '4px', width: '2px', background: '#e5e7eb' } }),
      items.map((it, i) => React.createElement('div', { key: i, style: { position: 'relative', marginBottom: '20px' } },
        React.createElement('div', { style: { position: 'absolute', left: '-28px', top: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#2563eb', border: '3px solid #dbeafe' } }),
        React.createElement('div', { style: { fontSize: '12px', color: '#2563eb', fontWeight: 700, marginBottom: '4px' } }, it.time),
        React.createElement('div', { style: { fontSize: '16px', fontWeight: 700, color: '#111827', marginBottom: '4px' } }, it.title),
        React.createElement('div', { style: { fontSize: '14px', color: '#6b7280', lineHeight: 1.6 } }, it.description)
      ))
    )
  );
}`
  },
  {
    name: 'ImageBlock', category: 'media',
    semantic_description: '图片展示组件 单张图片 带说明文字 科技新闻配图照片图注',
    source: `function ImageBlock({ src, alt, caption }) {
  return React.createElement('figure', { style: { margin: '24px 0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' } },
    React.createElement('img', { src, alt, style: { width: '100%', display: 'block', maxHeight: '480px', objectFit: 'cover' } }),
    caption && React.createElement('figcaption', { style: { background: '#f9fafb', padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'center' } }, '📷 ' + caption)
  );
}`
  },
  {
    name: 'CodeBlock', category: 'interactive',
    semantic_description: '代码块组件 语法高亮 技术文章代码示例 程序代码片段显示带行号',
    source: `function CodeBlock({ language = 'javascript', code = '' }) {
  return React.createElement('div', { style: { margin: '24px 0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' } },
    React.createElement('div', { style: { background: '#1f2937', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' } },
      React.createElement('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' } }),
      React.createElement('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' } }),
      React.createElement('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' } }),
      React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' } }, language.toUpperCase())
    ),
    React.createElement('pre', { style: { margin: 0, background: '#0f172a', padding: '20px', overflowX: 'auto' } },
      React.createElement('code', { style: { color: '#a5f3fc', fontSize: '13px', lineHeight: 1.6, fontFamily: '"SF Mono", Consolas, monospace', whiteSpace: 'pre' } }, code)
    )
  );
}`
  },
  {
    name: 'RichParagraph', category: 'content',
    semantic_description: '正文段落组件 长文本阅读 文章内容段落排版科技新闻正文',
    source: `function RichParagraph({ content }) {
  return React.createElement('div', { style: { margin: '20px 0', fontSize: '16px', lineHeight: 1.8, color: '#1f2937' } },
    (content || '').split(/\\n\\n/).filter(Boolean).map((p, i) =>
      React.createElement('p', { key: i, style: { margin: '0 0 16px 0', textAlign: 'justify' } }, p)
    )
  );
}`
  },
  {
    name: 'NewsCard', category: 'content',
    semantic_description: '新闻卡片组件 科技资讯摘要 标题摘要发布日期标签卡片式布局',
    source: `function NewsCard({ title, summary, publishedAt, tags = [] }) {
  return React.createElement('article', { style: { margin: '24px 0', background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '24px' } },
    React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
      tags.map((t, i) => React.createElement('span', { key: i, style: { background: '#2563eb', color: 'white', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 } }, '#' + t))
    ),
    React.createElement('h3', { style: { fontSize: '22px', fontWeight: 800, color: '#111827', margin: '0 0 10px 0' } }, title),
    React.createElement('p', { style: { fontSize: '15px', color: '#4b5563', lineHeight: 1.7, margin: '0 0 12px 0' } }, summary),
    React.createElement('div', { style: { fontSize: '13px', color: '#9ca3af' } }, '📅 发布日期：' + publishedAt)
  );
}`
  },
  {
    name: 'ImageGallery', category: 'media',
    semantic_description: '图片画廊组件 多图展示 组图浏览 科技产品图片集相册网格排列',
    source: `function ImageGallery({ images = [] }) {
  return React.createElement('div', { style: { margin: '24px 0' } },
    React.createElement('div', { style: { fontSize: '14px', color: '#6b7280', marginBottom: '12px', fontWeight: 600 } }, '🖼 图片图集'),
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' } },
      images.map((img, i) => React.createElement('div', { key: i, style: { borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', aspectRatio: '4/3' } },
        React.createElement('img', { src: img.src, alt: img.alt || '', style: { width: '100%', height: '100%', objectFit: 'cover' } })
      ))
    )
  );
}`
  },
  {
    name: 'QuoteBlock', category: 'content',
    semantic_description: '引用块组件 引言金句 专家观点 突出显示重要文字引用块',
    source: `function QuoteBlock({ text, author }) {
  return React.createElement('blockquote', { style: { margin: '24px 0', padding: '20px 28px', borderLeft: '4px solid #2563eb', background: '#f0f9ff', borderRadius: '0 12px 12px 0', fontStyle: 'italic' } },
    React.createElement('div', { style: { fontSize: '18px', color: '#1e40af', lineHeight: 1.7, marginBottom: '12px' } }, '\u201C' + text + '\u201D'),
    author && React.createElement('div', { style: { fontSize: '14px', color: '#64748b', textAlign: 'right', fontWeight: 600 } }, '\u2014 ' + author)
  );
}`
  },
  {
    name: 'KeyPointsList', category: 'content',
    semantic_description: '要点列表组件 核心要点 关键信息列表 科技文章要点摘要清单',
    source: `function KeyPointsList({ items = [] }) {
  return React.createElement('div', { style: { margin: '24px 0', padding: '20px 24px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '12px' } },
    React.createElement('div', { style: { fontSize: '14px', color: '#92400e', marginBottom: '12px', fontWeight: 700 } }, '\u2B50 核心要点'),
    React.createElement('ul', { style: { margin: 0, paddingLeft: '0', listStyle: 'none' } },
      items.map((it, i) => React.createElement('li', { key: i, style: { padding: '8px 0', fontSize: '15px', color: '#78350f', display: 'flex', alignItems: 'flex-start', gap: '10px', lineHeight: 1.6 } },
        React.createElement('span', { style: { color: '#eab308', fontSize: '18px', flexShrink: 0 } }, '\u2726'),
        React.createElement('span', null, it)
      ))
    )
  );
}`
  },
  {
    name: 'VideoEmbed', category: 'media',
    semantic_description: '视频嵌入组件 播放器 科技发布会视频 产品演示视频展示',
    source: `function VideoEmbed({ url, poster }) {
  return React.createElement('div', { style: { margin: '24px 0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' } },
    React.createElement('video', { controls: true, poster, style: { width: '100%', display: 'block', background: '#000' } },
      React.createElement('source', { src: url, type: 'video/mp4' }),
      '您的浏览器不支持视频播放。'
    )
  );
}`
  },
];

async function run() {
  await initDB();
  console.log('[Seed] DB initialized.');
  await getEmbedding('warmup');
  console.log('[Seed] Embedding model warmed up.');

  const existing = queryAll('components');
  if (existing && existing.length > 0) {
    console.log(`[Seed] DB already has ${existing.length} components. Clearing and reseeding.`);
  }

  for (const def of COMPONENTS) {
    const cid = uuidv4();
    const vid = uuidv4();
    const vec = await getEmbedding(def.semantic_description);
    const buf = vectorToBuffer(vec);

    insert('components', {
      id: cid,
      name: def.name,
      semantic_description: def.semantic_description,
      category: def.category,
      props_schema: null,
    });
    insert('component_versions', {
      id: vid,
      component_id: cid,
      version: '1.0.0',
      source_code: def.source,
      semantic_vector: buf,
      changelog: '初始版本',
      is_active: 1,
    });
    console.log(`[Seed] Registered ${def.name}@1.0.0`);
  }

  console.log(`[Seed] Done. ${COMPONENTS.length} components registered.`);
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
