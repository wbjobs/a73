import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { LayoutRenderer, DynamicRenderer } from './DynamicRenderer.jsx';

const SUGGESTED_INTENTS = [
  '这篇是科技新闻，要突出时间线，有图片和代码块',
  '产品评测文章，需要图片画廊、要点列表和引用专家观点',
  '技术教程，要有代码块、步骤时间线和视频演示',
  '深度报道，需要大标题头图、正文长段落、新闻卡片摘要',
  '发布会报道，视频开头、时间线历程、要点总结、图片集',
];

function Nav({ current }) {
  const tabs = [
    { key: 'editor', label: '✍️ 文章编辑器', path: '/' },
    { key: 'articles', label: '📚 文章列表', path: '/articles' },
    { key: 'library', label: '🧩 组件库', path: '/components' },
  ];
  return React.createElement('nav', { style: { background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: 'white', padding: '0 24px', boxShadow: '0 2px 8px rgba(30,58,138,0.25)' } },
    React.createElement('div', { style: { maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', height: 60, gap: 32 } },
      React.createElement(Link, { to: '/', style: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'white' } },
        React.createElement('div', { style: { width: 34, height: 34, background: 'white', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 } }, '🧠'),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 800, fontSize: 16 } }, 'Semantic CMS'),
          React.createElement('div', { style: { fontSize: 11, opacity: 0.75 } }, '语义路由 · 混合渲染')
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 4 } },
        tabs.map(t => React.createElement(Link, { key: t.key, to: t.path, style: {
          padding: '8px 16px', borderRadius: 8, textDecoration: 'none',
          color: current === t.key ? 'white' : 'rgba(255,255,255,0.8)',
          background: current === t.key ? 'rgba(255,255,255,0.18)' : 'transparent',
          fontWeight: 600, fontSize: 14,
        } }, t.label))
      )
    )
  );
}

function EditorPage() {
  const nav = useNavigate();
  const params = useParams();
  const editingId = params.id;

  const [title, setTitle] = useState('AI 驱动的语义路由如何重构 CMS 体验');
  const [intent, setIntent] = useState(SUGGESTED_INTENTS[0]);
  const [body, setBody] = useState('传统CMS需要编辑者手动选择组件和模板，而语义路由通过理解内容意图自动推荐最佳组件组合。\n\n基于向量相似度计算，系统从组件库中检索出匹配度最高的组件，并智能排序生成页面布局JSON。前端动态渲染引擎根据JSON即时加载组件源码，完成页面呈现。');
  const [topK, setTopK] = useState(3);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState([]);
  const [layout, setLayout] = useState([]);
  const [debug, setDebug] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (editingId) {
      api.getArticle(editingId).then(a => {
        setTitle(a.title);
        setIntent(a.intent_description);
        setBody(a.content?.body || '');
        setLayout(a.layout_json || []);
      }).catch(e => alert('加载失败: ' + e.message));
    }
  }, [editingId]);

  const runMatch = async () => {
    if (!intent.trim()) return showToast('请先输入内容意图描述', 'error');
    setMatching(true);
    try {
      const res = await api.matchComponents(intent, topK);
      setMatches(res.matches);
      setLayout(res.layout);
      setDebug(res.debug);
      showToast(`匹配完成！从 ${res.debug.total_considered} 个组件中选出 Top ${res.matches.length}`, 'success');
    } catch (e) {
      showToast('匹配失败: ' + e.message, 'error');
    } finally {
      setMatching(false);
    }
  };

  const saveArticle = async (status) => {
    if (!title.trim()) return showToast('请输入文章标题', 'error');
    if (!intent.trim()) return showToast('请输入内容意图描述', 'error');
    if (layout.length === 0) return showToast('请先运行语义匹配获取组件', 'error');
    setSaving(true);
    try {
      const payload = {
        title, intent_description: intent,
        content: { body },
        layout, status,
      };
      if (editingId) {
        await api.updateArticle(editingId, payload);
        showToast('文章已更新', 'success');
      } else {
        const r = await api.createArticle(payload);
        showToast(status === 'published' ? '文章已发布！' : '草稿已保存', 'success');
        if (status === 'published') setTimeout(() => nav('/articles'), 900);
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateNodeProps = (nodeId, props) => {
    setLayout(layout.map(n => n.id === nodeId ? { ...n, props } : n));
  };

  const removeNode = (nodeId) => setLayout(layout.filter(n => n.id !== nodeId));

  const moveNode = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= layout.length) return;
    const arr = [...layout];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setLayout(arr.map((n, i) => ({ ...n, order: i })));
  };

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  return React.createElement(React.Fragment, null,
    Nav({ current: 'editor' }),
    toast && React.createElement('div', { style: {
      position: 'fixed', top: 80, right: 24, zIndex: 1000,
      padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
      background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
      color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    } }, toast.msg),

    React.createElement('div', { style: { maxWidth: 1400, margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 24 } },

      React.createElement('section', { style: { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 24, border: '1px solid #e2e8f0' } },
        React.createElement('h2', { style: { margin: '0 0 20px 0', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 } }, '📝 内容编辑',
          editingId && React.createElement('span', { style: { fontSize: 12, color: '#64748b', fontWeight: 400, background: '#f1f5f9', padding: '3px 10px', borderRadius: 999 } }, '编辑中')
        ),

        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '标题'),
          React.createElement('input', {
            value: title, onChange: e => setTitle(e.target.value),
            style: { width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' },
            placeholder: '输入文章标题'
          })
        ),

        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } },
            '🧠 内容意图描述（用于语义匹配组件）',
            React.createElement('span', { style: { marginLeft: 8, fontWeight: 400, color: '#94a3b8', fontSize: 12 } }, '描述得越详细，匹配越精准')
          ),
          React.createElement('textarea', {
            value: intent, onChange: e => setIntent(e.target.value),
            rows: 3,
            style: { width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 8, border: '2px solid #bfdbfe', outline: 'none', resize: 'vertical', minHeight: 80, background: '#eff6ff' },
            placeholder: '例如：这篇是科技新闻，要突出时间线，有图片和代码块'
          }),
          React.createElement('div', { style: { marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 } },
            SUGGESTED_INTENTS.map((s, i) => React.createElement('button', {
              key: i, onClick: () => setIntent(s),
              style: { padding: '5px 10px', fontSize: 12, border: '1px solid #dbeafe', background: 'white', color: '#1e40af', borderRadius: 999, cursor: 'pointer' }
            }, '💡 ' + s.slice(0, 18) + '...'))
          )
        ),

        React.createElement('div', { style: { marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' } },
          React.createElement('div', null,
            React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '匹配组件数 (Top-K)'),
            React.createElement('select', { value: topK, onChange: e => setTopK(Number(e.target.value)), style: { padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 } },
              [2, 3, 4, 5, 6].map(n => React.createElement('option', { key: n, value: n }, `Top ${n}`))
            )
          ),
          React.createElement('button', {
            onClick: runMatch, disabled: matching,
            style: { flex: 1, minWidth: 180, padding: '11px 20px', fontSize: 14, fontWeight: 700, background: matching ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', border: 'none', borderRadius: 10, cursor: matching ? 'not-allowed' : 'pointer', boxShadow: matching ? 'none' : '0 4px 12px rgba(59,130,246,0.35)' }
          }, matching ? '🤖 AI 正在分析意图...' : '🔍 运行语义匹配')
        ),

        debug && React.createElement('div', { style: { marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#0369a1' } },
          '📊 检索了 ', React.createElement('b', null, debug.total_considered), ' 个组件，分数范围: [',
          (debug.score_range?.[0] * 100).toFixed(1), '% ~ ', (debug.score_range?.[1] * 100).toFixed(1), '%]'
        ),

        matches.length > 0 && React.createElement('div', { style: { marginBottom: 20 } },
          React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: '#334155', margin: '0 0 10px 0' } }, '🤝 语义匹配结果（按得分排序）'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            matches.map((m, i) => React.createElement('div', { key: i, style: {
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
              background: 'linear-gradient(90deg, #f0f9ff 0%, #fafafa 100%)', border: '1px solid #e0e7ff'
            } },
              React.createElement('div', { style: { width: 32, height: 32, borderRadius: 8, background: '#6366f1', color: 'white', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 } }, i + 1),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontWeight: 700, color: '#1e1b4b', fontSize: 14 } }, m.name,
                  React.createElement('span', { style: { marginLeft: 8, fontSize: 11, color: '#6366f1', background: '#e0e7ff', padding: '2px 8px', borderRadius: 999 } }, m.category || '—')
                ),
                React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.semantic_description)
              ),
              React.createElement('div', { style: { textAlign: 'right' } },
                React.createElement('div', { style: { fontSize: 16, fontWeight: 800, color: m.score >= 0.6 ? '#059669' : m.score >= 0.4 ? '#d97706' : '#dc2626' } }, (m.score * 100).toFixed(1) + '%'),
                React.createElement('div', { style: { fontSize: 10, color: '#94a3b8' } }, '匹配度')
              )
            ))
          )
        ),

        React.createElement('div', { style: { marginBottom: 16 } },
          React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '正文内容'),
          React.createElement('textarea', {
            value: body, onChange: e => setBody(e.target.value),
            rows: 8,
            style: { width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }
          })
        ),

        React.createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
          React.createElement('button', { onClick: () => saveArticle('draft'), disabled: saving, style: { padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' } },
            saving ? '保存中...' : '💾 保存草稿'
          ),
          React.createElement('button', { onClick: () => saveArticle('published'), disabled: saving, style: { padding: '10px 24px', fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.35)' } },
            saving ? '发布中...' : '🚀 发布文章'
          )
        )
      ),

      React.createElement('section', { style: { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
          React.createElement('h2', { style: { margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 } }, '👁️ 实时预览',
            React.createElement('span', { style: { fontSize: 12, background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 999, fontWeight: 600 } }, layout.length + ' 个组件')
          ),
          layout.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 6 } },
            React.createElement('button', { onClick: () => { setLayout([]); setMatches([]); }, style: { padding: '5px 10px', fontSize: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, cursor: 'pointer' } }, '清空')
          )
        ),
        React.createElement('div', { style: {
          border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px 28px',
          background: '#ffffff', flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 240px)',
          backgroundImage: 'radial-gradient(#f1f5f9 1px, transparent 1px)', backgroundSize: '20px 20px'
        } },
          React.createElement(LayoutRenderer, { nodes: layout, editable: true, onPropsChange: updateNodeProps })
        )
      )
    )
  );
}

function ArticlesPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = () => {
    setLoading(true);
    api.listArticles().then(setArticles).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return React.createElement(React.Fragment, null,
    Nav({ current: 'articles' }),
    React.createElement('div', { style: { maxWidth: 1200, margin: '0 auto', padding: 24 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        React.createElement('h1', { style: { margin: 0, fontSize: 24 } }, '📚 文章列表',
          React.createElement('span', { style: { marginLeft: 12, fontSize: 14, color: '#64748b', fontWeight: 400 } }, '共 ' + articles.length + ' 篇')
        ),
        React.createElement('button', { onClick: () => nav('/'), style: { padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' } }, '+ 新建文章')
      ),
      loading ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: '#94a3b8' } }, '加载中...') :
        articles.length === 0 ? React.createElement('div', { style: { padding: 80, textAlign: 'center', color: '#94a3b8', border: '2px dashed #cbd5e1', borderRadius: 14 } },
          '还没有文章，去编辑器创建第一篇吧 👉',
          React.createElement('button', { onClick: () => nav('/'), style: { marginLeft: 12, padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' } }, '开始创作')
        ) :
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 } },
            articles.map(a => React.createElement('article', { key: a.id, style: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } },
              React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' } },
                React.createElement('span', { style: { fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 600,
                  background: a.status === 'published' ? '#dcfce7' : '#fef9c3',
                  color: a.status === 'published' ? '#166534' : '#854d0e'
                } }, a.status === 'published' ? '✅ 已发布' : '📝 草稿'),
                React.createElement('span', { style: { fontSize: 11, padding: '3px 10px', borderRadius: 999, background: '#e0e7ff', color: '#4338ca', fontWeight: 600 } },
                  (a.layout_json?.length || 0) + ' 个组件'
                )
              ),
              React.createElement('h3', { style: { margin: '0 0 6px 0', fontSize: 17, fontWeight: 700, color: '#0f172a' } }, a.title),
              React.createElement('p', { style: { margin: '0 0 12px 0', fontSize: 13, color: '#64748b', lineHeight: 1.6,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
              } }, '💭 ' + a.intent_description),
              React.createElement('div', { style: { fontSize: 11, color: '#94a3b8', marginBottom: 14 } },
                '🕒 更新于 ', a.updated_at, ' · 创建于 ', a.created_at
              ),
              React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                React.createElement('button', { onClick: () => nav('/view/' + a.id), style: { padding: '6px 12px', fontSize: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '👁️ 预览'),
                React.createElement('button', { onClick: () => nav('/edit/' + a.id), style: { padding: '6px 12px', fontSize: 12, border: '1px solid #e2e8f0', background: 'white', color: '#334155', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '✏️ 编辑'),
                React.createElement('button', { onClick: () => { if (confirm('确定删除？')) { api.deleteArticle(a.id).then(load); } }, style: { padding: '6px 12px', fontSize: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '🗑️ 删除')
              )
            ))
          )
    )
  );
}

function ViewPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.renderArticle(id).then(r => {
      setData(r);
      setLoading(false);
    }).catch(e => { alert(e.message); setLoading(false); });
  }, [id]);

  if (loading) return React.createElement(React.Fragment, null, Nav({}),
    React.createElement('div', { style: { padding: 60, textAlign: 'center' } }, '加载中...'));

  return React.createElement(React.Fragment, null,
    Nav({}),
    React.createElement('div', { style: { background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 400px)', minHeight: '100vh' } },
      React.createElement('div', { style: { maxWidth: 800, margin: '0 auto', padding: '40px 24px 80px' } },
        React.createElement('button', { onClick: () => nav(-1), style: { background: 'none', border: 'none', color: '#3b82f6', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 20 } }, '← 返回'),
        React.createElement('div', { style: { marginBottom: 24, padding: '14px 18px', background: 'rgba(59,130,246,0.08)', border: '1px solid #bfdbfe', borderRadius: 12, fontSize: 13, color: '#1e40af' } },
          React.createElement('div', { style: { fontWeight: 700, marginBottom: 4 } }, '🧠 内容意图描述：'),
          React.createElement('div', null, data?.article.intent_description)
        ),
        React.createElement(LayoutRenderer, { nodes: data?.nodes || [], editable: false }),
        data?.nodes && data.nodes.length > 0 && React.createElement('div', { style: { marginTop: 40, paddingTop: 24, borderTop: '1px solid #e2e8f0' } },
          React.createElement('h4', { style: { margin: '0 0 14px 0', fontSize: 13, color: '#64748b', fontWeight: 600 } }, '📋 组件使用记录（带语义匹配得分）'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            data.nodes.map((n, i) => React.createElement('div', { key: i, style: {
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13
            } },
              React.createElement('span', { style: { width: 26, height: 26, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569' } }, i + 1),
              React.createElement('span', { style: { flex: 1, fontWeight: 600, color: '#1e293b' } }, n.component.name),
              React.createElement('span', { style: { fontSize: 11, color: '#94a3b8' } }, '@' + n.component.version),
              React.createElement('span', { style: { padding: '3px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11,
                background: n.match_score >= 0.6 ? '#dcfce7' : n.match_score >= 0.4 ? '#fef9c3' : '#fee2e2',
                color: n.match_score >= 0.6 ? '#166534' : n.match_score >= 0.4 ? '#854d0e' : '#991b1b'
              } }, (n.match_score * 100).toFixed(1) + '%')
            ))
          )
        )
      )
    )
  );
}

function ComponentsPage() {
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'content', semantic_description: '', version: '1.0.0',
    source_code: `function MyComponent({ title }) { return React.createElement('div', null, title); }`,
    changelog: '初始版本',
  });
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = () => {
    setLoading(true);
    api.listComponents().then(r => { setComps(r); setLoading(false); });
  };
  useEffect(load, []);

  const submitNew = async () => {
    try {
      const r = await api.createComponent({
        name: form.name, category: form.category, semantic_description: form.semantic_description,
        version: form.version, source_code: form.source_code, changelog: form.changelog,
      });
      setShowForm(false);
      setForm({ ...form, name: '', semantic_description: '' });
      load();
      alert('组件注册成功！');
    } catch (e) {
      alert('注册失败: ' + e.message);
    }
  };

  const activateVer = async (cid, vid) => {
    try { await api.activateVersion(cid, vid); load(); }
    catch (e) { alert(e.message); }
  };

  if (detail) {
    const c = comps.find(x => x.id === detail);
    return React.createElement(React.Fragment, null,
      Nav({ current: 'library' }),
      React.createElement('div', { style: { maxWidth: 1100, margin: '0 auto', padding: 24 } },
        React.createElement('button', { onClick: () => { setDetail(null); setPreview(null); }, style: { background: 'none', border: 'none', color: '#3b82f6', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 20 } }, '← 返回列表'),
        c && React.createElement('div', { style: { background: 'white', borderRadius: 14, padding: 28, border: '1px solid #e2e8f0' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 20 } },
            React.createElement('div', null,
              React.createElement('h1', { style: { margin: '0 0 8px 0', fontSize: 26, color: '#0f172a' } }, '🧩 ' + c.name),
              React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                React.createElement('span', { style: { fontSize: 12, padding: '4px 12px', background: '#e0e7ff', color: '#4338ca', borderRadius: 999, fontWeight: 600 } }, c.category),
                c.active_version && React.createElement('span', { style: { fontSize: 12, padding: '4px 12px', background: '#dcfce7', color: '#166534', borderRadius: 999, fontWeight: 600 } }, '当前版本 ' + c.active_version.version)
              )
            ),
            preview === null && c.active_version && React.createElement('button', {
              onClick: () => setPreview(true),
              style: { padding: '8px 16px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }
            }, '▶️ 预览组件')
          ),
          React.createElement('div', { style: { marginBottom: 20, padding: '14px 18px', background: '#f8fafc', borderLeft: '4px solid #6366f1', borderRadius: 8, fontSize: 14, color: '#334155', lineHeight: 1.7 } },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#6366f1', marginBottom: 4 } }, '📝 语义描述（用于匹配）'),
            c.semantic_description
          ),
          preview && c.active_version && React.createElement('div', { style: { marginBottom: 20, padding: 24, borderRadius: 12, background: '#fafafa', border: '1px solid #e2e8f0' } },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 14 } }, '🖼️ 组件渲染预览'),
            React.createElement(DynamicRenderer, {
              sourceCode: c.active_version.source_code, componentName: c.name,
              props: inferPreviewProps(c.name)
            })
          ),
          React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, margin: '0 0 12px 0' } }, '📜 版本历史'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            c.versions.map(v => React.createElement('div', { key: v.id, style: {
              padding: '14px 18px', border: '1px solid ' + (v.is_active ? '#10b981' : '#e2e8f0'),
              background: v.is_active ? '#f0fdf4' : 'white', borderRadius: 10
            } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                  React.createElement('span', { style: { fontWeight: 800, fontSize: 15 } }, 'v' + v.version),
                  v.is_active && React.createElement('span', { style: { fontSize: 11, padding: '2px 10px', borderRadius: 999, background: '#10b981', color: 'white', fontWeight: 600 } }, '✓ 激活中')
                ),
                !v.is_active && React.createElement('button', { onClick: () => activateVer(c.id, v.id), style: { padding: '5px 12px', fontSize: 12, border: '1px solid #10b981', background: 'white', color: '#059669', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '切换到此版本')
              ),
              React.createElement('div', { style: { fontSize: 12, color: '#64748b', marginBottom: 6 } }, v.changelog || '无变更说明'),
              React.createElement('details', { style: { fontSize: 12 } },
                React.createElement('summary', { style: { cursor: 'pointer', color: '#475569', fontWeight: 600 } }, '查看源代码'),
                React.createElement('pre', { style: { marginTop: 8, padding: 12, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, overflowX: 'auto', maxHeight: 300 } }, v.source_code)
              )
            ))
          )
        )
      )
    );
  }

  return React.createElement(React.Fragment, null,
    Nav({ current: 'library' }),
    React.createElement('div', { style: { maxWidth: 1300, margin: '0 auto', padding: 24 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 } },
        React.createElement('div', null,
          React.createElement('h1', { style: { margin: '0 0 4px 0', fontSize: 24 } }, '🧩 组件库索引'),
          React.createElement('div', { style: { fontSize: 13, color: '#64748b' } }, '共 ' + comps.length + ' 个已注册组件 · 基于语义向量匹配')
        ),
        React.createElement('button', { onClick: () => setShowForm(true), style: { padding: '10px 20px', fontSize: 14, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.35)' } }, '+ 注册新组件')
      ),

      showForm && React.createElement('div', { style: { background: 'white', borderRadius: 14, padding: 24, border: '1px solid #e2e8f0', marginBottom: 20, boxShadow: '0 4px 12px rgba(99,102,241,0.08)' } },
        React.createElement('h3', { style: { margin: '0 0 16px 0', fontSize: 18 } }, '📝 注册组件'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 } },
          fieldInput('组件名称 (函数名)', form.name, v => setForm({ ...form, name: v })),
          fieldSelect('分类', form.category, v => setForm({ ...form, category: v }), [
            ['layout', '布局结构'], ['content', '正文内容'], ['media', '媒体图片'], ['interactive', '交互代码']
          ]),
          fieldInput('版本号', form.version, v => setForm({ ...form, version: v })),
        ),
        React.createElement('div', { style: { marginTop: 14 } },
          React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '🧠 语义描述（越详细匹配越准）'),
          React.createElement('input', { value: form.semantic_description, onChange: e => setForm({ ...form, semantic_description: e.target.value }),
            placeholder: '例如：时间线组件 科技新闻发展历程 时间节点 里程碑 事件时间轴按时间顺序展示',
            style: { width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' } })
        ),
        React.createElement('div', { style: { marginTop: 14 } },
          React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '📜 React 源代码 (使用 React.createElement)'),
          React.createElement('textarea', { value: form.source_code, onChange: e => setForm({ ...form, source_code: e.target.value }),
            rows: 10, style: { width: '100%', padding: 12, fontSize: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'monospace', background: '#0f172a', color: '#a5f3fc', outline: 'none', resize: 'vertical' } })
        ),
        React.createElement('div', { style: { marginTop: 14, display: 'flex', gap: 10 } },
          React.createElement('button', { onClick: submitNew, style: { padding: '10px 22px', fontSize: 14, fontWeight: 600, background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' } }, '提交注册'),
          React.createElement('button', { onClick: () => setShowForm(false), style: { padding: '10px 22px', fontSize: 14, fontWeight: 600, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer' } }, '取消')
        )
      ),

      loading ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: '#94a3b8' } }, '加载中...') :
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 } },
          comps.map(c => React.createElement('div', { key: c.id, style: {
            background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, cursor: 'pointer',
            transition: 'all 0.2s',
          },
          onMouseEnter: e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.1)'; },
          onMouseLeave: e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; },
          onClick: () => setDetail(c.id)
          },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 } },
              React.createElement('div', { style: { width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 } }, '🧩'),
              React.createElement('span', { style: { fontSize: 10, padding: '3px 8px', borderRadius: 999, fontWeight: 600,
                background: c.category === 'layout' ? '#dbeafe' : c.category === 'media' ? '#fce7f3' : c.category === 'interactive' ? '#fef3c7' : '#dcfce7',
                color: c.category === 'layout' ? '#1e40af' : c.category === 'media' ? '#9d174d' : c.category === 'interactive' ? '#92400e' : '#166534'
              } }, c.category)
            ),
            React.createElement('h3', { style: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 700, color: '#0f172a' } }, c.name),
            React.createElement('p', { style: { margin: '0 0 10px 0', fontSize: 12, color: '#64748b', lineHeight: 1.6, minHeight: 36,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            } }, c.semantic_description),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { fontSize: 12, color: '#94a3b8' } }, (c.versions?.length || 0) + ' 个版本'),
              React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: '#3b82f6' } }, '查看详情 →')
            )
          ))
        )
    )
  );
}

function fieldInput(label, value, onChange) {
  return React.createElement('div', null,
    React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, label),
    React.createElement('input', { value, onChange: e => onChange(e.target.value), style: { width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' } })
  );
}
function fieldSelect(label, value, onChange, options) {
  return React.createElement('div', null,
    React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, label),
    React.createElement('select', { value, onChange: e => onChange(e.target.value), style: { width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' } },
      options.map(([v, l]) => React.createElement('option', { key: v, value: v }, l))
    )
  );
}

function inferPreviewProps(name) {
  const n = name.toLowerCase();
  if (n.includes('header') || n.includes('标题')) return { eyebrow: '科技前沿', title: '示例组件标题', subtitle: '这是组件预览模式下的效果' };
  if (n.includes('timeline') || n.includes('时间')) return { items: [{ time: '2024-01', title: '里程碑一', description: '示例事件说明文字' }, { time: '2024-06', title: '里程碑二', description: '又一个事件节点' }] };
  if (n.includes('image') && n.includes('gallery')) return { images: [{ src: 'https://picsum.photos/220/160?1', alt: '' }, { src: 'https://picsum.photos/220/160?2', alt: '' }] };
  if (n.includes('image')) return { src: 'https://picsum.photos/600/340', alt: '示例图', caption: '图片说明' };
  if (n.includes('code')) return { language: 'javascript', code: 'function hello() {\n  console.log("preview");\n}' };
  if (n.includes('paragraph') || n.includes('rich')) return { content: '这是组件预览模式下渲染出的正文段落。此处显示的是默认数据，实际使用时会根据文章内容填充。\n\n段落分隔效果也能正常呈现。' };
  if (n.includes('card') || n.includes('news')) return { title: '示例新闻卡片', summary: '新闻摘要内容用于预览模式下的显示效果', publishedAt: '2025-01-01', tags: ['示例', '预览'] };
  if (n.includes('quote')) return { text: '这是预览模式下显示的引用内容', author: '示例作者' };
  if (n.includes('list') || n.includes('要点')) return { items: ['预览要点一', '预览要点二', '预览要点三'] };
  if (n.includes('video')) return { url: 'https://www.w3schools.com/html/mov_bbb.mp4', poster: 'https://picsum.photos/640/360' };
  return { title: '示例数据' };
}

function App() {
  return React.createElement(Routes, null,
    React.createElement(Route, { path: '/', element: React.createElement(EditorPage) }),
    React.createElement(Route, { path: '/edit/:id', element: React.createElement(EditorPage) }),
    React.createElement(Route, { path: '/articles', element: React.createElement(ArticlesPage) }),
    React.createElement(Route, { path: '/components', element: React.createElement(ComponentsPage) }),
    React.createElement(Route, { path: '/view/:id', element: React.createElement(ViewPage) })
  );
}

export default App;
