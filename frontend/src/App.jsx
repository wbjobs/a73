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
  const [originalLayout, setOriginalLayout] = useState([]);
  const [debug, setDebug] = useState(null);
  const [classification, setClassification] = useState(null);
  const [toast, setToast] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [sessionId] = useState(() => 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [lastInterventionAt, setLastInterventionAt] = useState(0);

  useEffect(() => {
    if (editingId) {
      api.getArticle(editingId).then(a => {
        setTitle(a.title);
        setIntent(a.intent_description);
        setBody(a.content?.body || '');
        setLayout(a.layout_json || []);
        setJsonText(JSON.stringify(a.layout_json || [], null, 2));
      }).catch(e => alert('加载失败: ' + e.message));
    }
  }, [editingId]);

  useEffect(() => {
    setJsonText(JSON.stringify(layout, null, 2));
  }, [layout]);

  const runMatch = async () => {
    if (!intent.trim()) return showToast('请先输入内容意图描述', 'error');
    setMatching(true);
    try {
      const res = await api.matchComponents(intent, topK);
      setMatches(res.matches);
      setLayout(res.layout);
      setOriginalLayout(JSON.parse(JSON.stringify(res.layout)));
      setDebug(res.debug);
      setClassification(res.classification || null);
      setJsonText(JSON.stringify(res.layout, null, 2));
      const labelInfo = res.classification ? ` | 标签: ${res.classification.labels.map(l => l.name).join(', ')}` : '';
      showToast(`匹配完成！从 ${res.debug.total_considered} 个组件中选出 Top ${res.matches.length}${labelInfo}`, 'success');
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
      const isAdjusted = isLayoutDifferent(originalLayout, layout);
      if (isAdjusted) {
        await submitFeedback('explicit_save', status === 'published');
      }
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

  const isLayoutDifferent = (orig, cur) => {
    if (!orig || !cur) return orig !== cur;
    if (orig.length !== cur.length) return true;
    const origIds = orig.map(n => n.component_id).join(',');
    const curIds = cur.map(n => n.component_id).join(',');
    return origIds !== curIds;
  };

  const submitFeedback = async (type = 'manual_adjust', isPublish = false) => {
    const isAdjusted = isLayoutDifferent(originalLayout, layout);
    if (!isAdjusted) return;
    const now = Date.now();
    if (now - lastInterventionAt < 2000) return;
    setLastInterventionAt(now);
    setFeedbackPending(true);
    try {
      await api.submitFeedback({
        intent_description: intent,
        original_layout: originalLayout,
        adjusted_layout: layout,
        original_matches: matches,
        intervention_type: type,
        session_id: sessionId,
        article_id: editingId || null,
      });
      showToast('✅ 已记录您的干预偏好，明天凌晨将用于增量训练！', 'success');
    } catch (e) {
      console.warn('Feedback submit failed:', e);
    } finally {
      setFeedbackPending(false);
    }
  };

  const updateNodeProps = (nodeId, props) => {
    const newLayout = layout.map(n => n.id === nodeId ? { ...n, props } : n);
    setLayout(newLayout);
    submitFeedback('props_edit');
  };

  const removeNode = (nodeId) => {
    const newLayout = layout.filter(n => n.id !== nodeId);
    setLayout(newLayout.map((n, i) => ({ ...n, order: i })));
    submitFeedback('remove_component');
  };

  const moveNode = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= layout.length) return;
    const arr = [...layout];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setLayout(arr.map((n, i) => ({ ...n, order: i })));
    submitFeedback('reorder_buttons');
  };

  const handleJsonChange = (e) => {
    const text = e.target.value;
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('必须是数组');
      setLayout(parsed.map((n, i) => ({ ...n, order: i })));
      setJsonError(null);
      submitFeedback('json_edit');
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  // ---- Drag and Drop ----
  const onDragStartMatch = (e, match) => {
    setDraggedItem({ type: 'candidate', data: match });
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'candidate', id: match.component_id }));
  };

  const onDragStartLayout = (e, node, index) => {
    setDraggedItem({ type: 'layout', data: node, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'layout', id: node.id, index }));
  };

  const onDragOver = (e, targetIndex = null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedItem?.type === 'candidate' ? 'copy' : 'move';
    if (targetIndex !== null) setDragOverIndex(targetIndex);
  };

  const onDragLeave = () => {
    setDragOverIndex(null);
  };

  const onDropLayout = (e, dropIndex = layout.length) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!draggedItem) return;

    if (draggedItem.type === 'candidate') {
      const match = draggedItem.data;
      const existing = layout.find(n => n.component_id === match.component_id);
      if (existing) {
        showToast('该组件已在布局中', 'error');
        return;
      }
      const newNode = {
        id: `node_${match.component_id}_${Date.now()}_${dropIndex}_${Math.random().toString(36).slice(2, 6)}`,
        component_id: match.component_id,
        component_version_id: match.component_version_id,
        component_name: match.name,
        version: match.version,
        _source_code: match.source_code,
        match_score: match.match_score,
        label_match_score: match.label_match_score,
        cosine_score: match.cosine_score,
        matched_labels: match.matched_labels || [],
        order: dropIndex,
        props: inferPropsFromMatch(match),
      };
      const newLayout = [...layout];
      newLayout.splice(dropIndex, 0, newNode);
      setLayout(newLayout.map((n, i) => ({ ...n, order: i })));
      submitFeedback('drag_add');
    } else if (draggedItem.type === 'layout') {
      const fromIndex = draggedItem.index;
      const toIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
      if (fromIndex === toIndex) return;
      const newLayout = [...layout];
      const [moved] = newLayout.splice(fromIndex, 1);
      newLayout.splice(toIndex, 0, moved);
      setLayout(newLayout.map((n, i) => ({ ...n, order: i })));
      submitFeedback('drag_reorder');
    }
    setDraggedItem(null);
  };

  const inferPropsFromMatch = (match) => {
    const n = (match.name || '').toLowerCase();
    const intentLow = intent.toLowerCase();
    if (n.includes('timeline') || n.includes('时间线')) return { items: [{ time: '2024-01', title: '关键事件一', description: '此处填写事件详情' }, { time: '2024-06', title: '关键事件二', description: '此处填写事件详情' }, { time: '2025-01', title: '最新进展', description: '此处填写最新状态' }] };
    if (n.includes('image') && !n.includes('gallery')) return { src: 'https://picsum.photos/800/450', alt: '示例图片', caption: '图片说明文字' };
    if (n.includes('code') || n.includes('代码')) return { language: 'javascript', code: '// 示例代码\nfunction hello() {\n  console.log("Hello, semantic CMS!");\n}\nhello();' };
    if (n.includes('paragraph') || n.includes('段落') || n.includes('rich')) return { content: '此处为正文内容区域，编辑者可在此填写文章的详细正文内容。\n\n支持多段落排版，段落之间使用双换行分隔。' };
    if (n.includes('news') || n.includes('新闻') || n.includes('card')) return { title: '新闻标题', summary: '新闻摘要内容，突出重点信息', publishedAt: new Date().toISOString().slice(0, 10), tags: ['科技', '前沿'] };
    if (n.includes('gallery') || n.includes('画廊')) return { images: [{ src: 'https://picsum.photos/400/300?1', alt: '图1' }, { src: 'https://picsum.photos/400/300?2', alt: '图2' }, { src: 'https://picsum.photos/400/300?3', alt: '图3' }] };
    if (n.includes('video') || n.includes('视频')) return { url: 'https://www.w3schools.com/html/mov_bbb.mp4', poster: 'https://picsum.photos/640/360' };
    if (n.includes('quote') || n.includes('引用')) return { text: '这是一段引用的文字，用来突出重要的观点或引言。', author: '未知作者' };
    if (n.includes('list') || n.includes('列表')) return { items: ['要点一：核心创新', '要点二：技术突破', '要点三：应用场景'] };
    if (n.includes('header') || n.includes('页头')) return { eyebrow: intentLow.includes('科技') ? '科技前沿' : '最新资讯', title: '文章主标题', subtitle: '副标题或导读内容' };
    return {};
  };

  const addCandidateToLayout = (match) => {
    const existing = layout.find(n => n.component_id === match.component_id);
    if (existing) return showToast('该组件已在布局中', 'error');
    const newNode = {
      id: `node_${match.component_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      component_id: match.component_id,
      component_version_id: match.component_version_id,
      component_name: match.name,
      version: match.version,
      _source_code: match.source_code,
      match_score: match.match_score,
      label_match_score: match.label_match_score,
      cosine_score: match.cosine_score,
      matched_labels: match.matched_labels || [],
      order: layout.length,
      props: inferPropsFromMatch(match),
    };
    setLayout([...layout, newNode]);
    submitFeedback('click_add');
  };

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return React.createElement(React.Fragment, null,
    Nav({ current: 'editor' }),
    toast && React.createElement('div', { style: {
      position: 'fixed', top: 80, right: 24, zIndex: 1000,
      padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
      background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
      color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: 420,
    } }, toast.msg),

    React.createElement('div', { style: { maxWidth: 1800, margin: '0 auto', padding: '16px 24px 24px' } },

      React.createElement('div', { style: { background: 'white', borderRadius: 14, padding: 20, border: '1px solid #e2e8f0', marginBottom: 16 } },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 220px', gap: 16, alignItems: 'flex-end' } },
          React.createElement('div', null,
            React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '标题'),
            React.createElement('input', {
              value: title, onChange: e => setTitle(e.target.value),
              style: { width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' },
              placeholder: '输入文章标题'
            })
          ),
          React.createElement('div', null,
            React.createElement('label', { style: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' } }, '🧠 内容意图描述（越详细匹配越准）'),
            React.createElement('input', {
              value: intent, onChange: e => setIntent(e.target.value),
              style: { width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 8, border: '2px solid #bfdbfe', outline: 'none', background: '#eff6ff' },
              placeholder: '例如：这篇是科技新闻，要突出时间线，有图片和代码块'
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('select', { value: topK, onChange: e => setTopK(Number(e.target.value)), style: { padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, minWidth: 90 } },
              [2, 3, 4, 5, 6].map(n => React.createElement('option', { key: n, value: n }, `Top ${n}`))
            ),
            React.createElement('button', {
              onClick: runMatch, disabled: matching,
              style: { flex: 1, padding: '10px 16px', fontSize: 14, fontWeight: 700, background: matching ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', border: 'none', borderRadius: 8, cursor: matching ? 'not-allowed' : 'pointer', boxShadow: matching ? 'none' : '0 4px 12px rgba(59,130,246,0.35)' }
            }, matching ? '🤖 AI分析中...' : '🔍 匹配')
          )
        ),
        React.createElement('div', { style: { marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 } },
          SUGGESTED_INTENTS.map((s, i) => React.createElement('button', {
            key: i, onClick: () => setIntent(s),
            style: { padding: '5px 10px', fontSize: 12, border: '1px solid #dbeafe', background: 'white', color: '#1e40af', borderRadius: 999, cursor: 'pointer' }
          }, '💡 ' + s.slice(0, 18) + '...'))
        ),

        debug && React.createElement('div', { style: { marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' } },
          React.createElement('div', { style: { padding: '8px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#0369a1' } },
            '📊 ', React.createElement('b', null, debug.total_considered), '总 → ',
            React.createElement('b', null, debug.label_filtered_count), '筛选 → ',
            React.createElement('b', null, matches.length), 'Top | 标签', (debug.label_weight * 100).toFixed(0) + '%',
            '+向量', (debug.cosine_weight * 100).toFixed(0) + '%',
            debug.elapsed_ms ? ' | ' + debug.elapsed_ms + 'ms' : ''
          ),
          classification && React.createElement('div', { style: { padding: '8px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 12, color: '#7c3aed', display: 'flex', gap: 8, alignItems: 'center' } },
            '🏷️ ',
            classification.model_timed_out && '⚠️模型超时 | ',
            !classification.model_timed_out && classification.source === 'keyword' && '🔑关键词 | ',
            classification.source === 'model+keyword' && '🤖模型 | ',
            React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
              classification.labels.slice(0, 6).map((l, i) => React.createElement('span', { key: i, style: {
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: l.confidence >= 0.7 ? '#dcfce7' : l.confidence >= 0.5 ? '#fef9c3' : '#fee2e2',
                color: l.confidence >= 0.7 ? '#166534' : l.confidence >= 0.5 ? '#854d0e' : '#991b1b',
              } }, l.name + ' ' + (l.confidence * 100).toFixed(0) + '%'))
            )
          )
        )
      ),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 360px', gap: 14, minHeight: 'calc(100vh - 280px)' } },

        React.createElement('section', { style: { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          React.createElement('div', { style: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' } },
            React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, '🧩 候选组件',
              React.createElement('span', { style: { fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 999, fontWeight: 600 } }, matches.length)),
            React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginTop: 4 } }, '拖拽到中间预览区添加')
          ),
          matches.length === 0 ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            '点击 "🔍 匹配" 按钮\n获取候选组件'
          ) :
            React.createElement('div', { style: { padding: 12, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 } },
              matches.map((m, i) => {
                const isInLayout = layout.some(n => n.component_id === m.component_id);
                return React.createElement('div', { key: m.component_id,
                  draggable: !isInLayout,
                  onDragStart: (e) => !isInLayout && onDragStartMatch(e, m),
                  onClick: () => addCandidateToLayout(m),
                  style: {
                    padding: '10px 12px', borderRadius: 10, border: '1px solid ' + (isInLayout ? '#e2e8f0' : '#c7d2fe'),
                    background: isInLayout ? '#f8fafc' : 'linear-gradient(90deg, #f0f9ff, #fafafa)',
                    cursor: isInLayout ? 'not-allowed' : 'grab',
                    opacity: isInLayout ? 0.5 : 1,
                    transition: 'all 0.15s',
                    userSelect: 'none',
                  }
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                    React.createElement('div', { style: { fontWeight: 700, color: '#1e1b4b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 } },
                      React.createElement('span', { style: { width: 22, height: 22, borderRadius: 6, background: '#6366f1', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, i + 1),
                      m.name
                    ),
                    React.createElement('span', { style: { fontSize: 13, fontWeight: 800, color: m.match_score >= 0.6 ? '#059669' : m.match_score >= 0.4 ? '#d97706' : '#dc2626' } }, (m.match_score * 100).toFixed(0) + '%')
                  ),
                  m.matched_labels && m.matched_labels.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 } },
                    m.matched_labels.slice(0, 3).map((lbl, li) => React.createElement('span', { key: li, style: { fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#dbeafe', color: '#1e40af', fontWeight: 600 } }, lbl))
                  ),
                  React.createElement('div', { style: { fontSize: 10, color: '#94a3b8', marginTop: 4 } }, isInLayout ? '✓ 已在布局中 · 点击不重复添加' : '点击添加 / 拖拽到预览区')
                );
              })
            )
        ),

        React.createElement('section', { style: { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          React.createElement('div', { style: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #eff6ff, #e0e7ff)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('div', null,
              React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, '👁️ 预览区',
                React.createElement('span', { style: { fontSize: 11, background: '#3b82f6', color: 'white', padding: '2px 10px', borderRadius: 999, fontWeight: 600 } }, layout.length + ' 个组件')
              ),
              React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginTop: 4 } }, '拖拽排序 · 从左侧拖入新增 · JSON面板可编辑')
            ),
            layout.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 6 } },
              React.createElement('button', { onClick: () => { setLayout([]); setOriginalLayout([]); setMatches([]); }, style: { padding: '5px 10px', fontSize: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, cursor: 'pointer' } }, '清空'),
              React.createElement('button', { onClick: () => saveArticle('draft'), disabled: saving || feedbackPending, style: { padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' } }, saving ? '保存中...' : '💾 草稿'),
              React.createElement('button', { onClick: () => saveArticle('published'), disabled: saving || feedbackPending, style: { padding: '6px 14px', fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(16,185,129,0.3)' } }, saving ? '发布中...' : '🚀 发布')
            )
          ),

          React.createElement('div', {
            onDragOver: (e) => onDragOver(e, layout.length),
            onDragLeave: onDragLeave,
            onDrop: (e) => onDropLayout(e, layout.length),
            style: {
              flex: 1, padding: 24, overflowY: 'auto',
              background: layout.length === 0 ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' : 'white',
              backgroundImage: layout.length === 0 ? 'radial-gradient(#e2e8f0 1px, transparent 1px)' : 'none',
              backgroundSize: '24px 24px',
              position: 'relative',
            }
          },
            layout.length === 0 ? React.createElement('div', { style: {
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              textAlign: 'center', color: '#94a3b8', fontSize: 14, maxWidth: 320, lineHeight: 1.8,
              padding: 40, border: '2px dashed #cbd5e1', borderRadius: 16, background: 'rgba(255,255,255,0.7)',
            } },
              React.createElement('div', { style: { fontSize: 48, marginBottom: 12 } }, '🖼️'),
              React.createElement('div', { style: { fontWeight: 700, color: '#64748b', fontSize: 16, marginBottom: 6 } }, '可视化组件拼装台'),
              React.createElement('div', { style: { fontSize: 12 } }, '从左侧候选组件拖拽到这里\n或点击组件卡片直接添加\n也可以在右侧JSON面板编辑')
            ) : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
              layout.map((node, idx) => React.createElement('div', { key: node.id,
                draggable: true,
                onDragStart: (e) => onDragStartLayout(e, node, idx),
                onDragOver: (e) => onDragOver(e, idx),
                onDragLeave: onDragLeave,
                onDrop: (e) => onDropLayout(e, idx),
                style: {
                  position: 'relative',
                  padding: 16,
                  border: dragOverIndex === idx ? '2px dashed #6366f1' : '1px solid #e2e8f0',
                  borderRadius: 12,
                  background: draggedItem?.type === 'layout' && draggedItem.index === idx ? '#f0f9ff' : 'white',
                  transition: 'all 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }
              },
                React.createElement('div', { style: {
                  position: 'absolute', top: -10, left: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                  background: 'white', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: 999,
                  zIndex: 10, display: 'flex', gap: 6, alignItems: 'center',
                } },
                  React.createElement('span', { style: { cursor: 'grab', userSelect: 'none' } }, '⋮⋮'),
                  '#' + (idx + 1) + ' · ' + node.component_name,
                  node.matched_labels && node.matched_labels.length > 0 && node.matched_labels.slice(0, 2).map((lbl, li) => React.createElement('span', { key: li, style: { background: '#dbeafe', color: '#1e40af', padding: '0 6px', borderRadius: 999, fontSize: 9 } }, lbl)),
                  React.createElement('span', { style: {
                    padding: '0 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                    background: node.match_score >= 0.6 ? '#dcfce7' : node.match_score >= 0.4 ? '#fef9c3' : '#fee2e2',
                    color: node.match_score >= 0.6 ? '#166534' : node.match_score >= 0.4 ? '#854d0e' : '#991b1b'
                  } }, (node.match_score * 100).toFixed(0) + '%')
                ),
                React.createElement('div', { style: { position: 'absolute', top: -8, right: 12, display: 'flex', gap: 4 } },
                  idx > 0 && React.createElement('button', { onClick: () => moveNode(idx, -1), style: { padding: '2px 6px', fontSize: 11, border: '1px solid #e2e8f0', background: 'white', borderRadius: 6, cursor: 'pointer', color: '#64748b' } }, '↑'),
                  idx < layout.length - 1 && React.createElement('button', { onClick: () => moveNode(idx, 1), style: { padding: '2px 6px', fontSize: 11, border: '1px solid #e2e8f0', background: 'white', borderRadius: 6, cursor: 'pointer', color: '#64748b' } }, '↓'),
                  React.createElement('button', { onClick: () => removeNode(node.id), style: { padding: '2px 8px', fontSize: 11, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, cursor: 'pointer' } }, '✕')
                ),
                React.createElement('div', { style: { marginTop: 8 } },
                  React.createElement(LayoutRenderer, { nodes: [node], editable: true, onPropsChange: updateNodeProps })
                )
              ))
            )
          )
        ),

        React.createElement('section', { style: { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          React.createElement('div', { style: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('div', null,
              React.createElement('h3', { style: { margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, '📝 布局 JSON'),
              React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginTop: 4 } }, '实时双向绑定 · 修改自动同步')
            ),
            React.createElement('div', { style: { display: 'flex', gap: 6 } },
              React.createElement('button', { onClick: formatJson, style: { padding: '5px 10px', fontSize: 11, border: '1px solid #bbf7d0', background: 'white', color: '#166534', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '格式化')
            )
          ),
          React.createElement('textarea', {
            value: jsonText,
            onChange: handleJsonChange,
            spellCheck: false,
            style: {
              flex: 1, width: '100%', padding: 14, fontSize: 11, fontFamily: '"JetBrains Mono", "Consolas", monospace',
              borderRadius: 0, border: 'none', outline: 'none', resize: 'none',
              background: jsonError ? '#fef2f2' : '#0f172a',
              color: jsonError ? '#b91c1c' : '#e2e8f0',
              lineHeight: 1.6, whiteSpace: 'pre',
            }
          }),
          jsonError && React.createElement('div', { style: { padding: '8px 14px', background: '#fef2f2', color: '#b91c1c', fontSize: 11, borderTop: '1px solid #fecaca' } },
            '❌ JSON 格式错误: ' + jsonError
          ),
          React.createElement('div', { style: { padding: 12, borderTop: '1px solid #f1f5f9', background: '#fafafa' } },
            React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600 } }, '📌 提示'),
            React.createElement('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 10, color: '#64748b', lineHeight: 1.7 } },
              React.createElement('li', null, '拖拽左侧组件卡片到预览区'),
              React.createElement('li', null, '在预览区内拖拽组件可重新排序'),
              React.createElement('li', null, '点击 ⬆⬇ 按钮可微调顺序'),
              React.createElement('li', null, '点击 ✕ 可移除组件'),
              React.createElement('li', null, '您的调整将被记录用于模型增量训练'),
              React.createElement('li', null, '💾 保存或 🚀 发布时自动提交反馈')
            )
          )
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
              n.matched_labels && n.matched_labels.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 3 } },
                n.matched_labels.slice(0, 3).map((lbl, li) => React.createElement('span', { key: li, style: { fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#dbeafe', color: '#1e40af', fontWeight: 600 } }, lbl))
              ),
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
            c.labels && c.labels.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 } },
              c.labels.slice(0, 5).map((lbl, li) => React.createElement('span', { key: li, style: { fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 } }, '🏷️' + lbl))
            ),
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
