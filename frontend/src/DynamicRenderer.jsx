import React, { useMemo, useState, useEffect } from 'react';

const componentCache = new Map();

function compileComponent(sourceCode, componentName) {
  const cacheKey = componentName || sourceCode.slice(0, 80);
  if (componentCache.has(cacheKey)) return componentCache.get(cacheKey);

  try {
    const factory = new Function(
      'React',
      '"use strict";' + sourceCode + `\n;return (typeof ${componentName} !== 'undefined') ? ${componentName} : (typeof exports !== 'undefined' ? exports.default : null);`
    );
    const Comp = factory(React);
    if (!Comp) {
      const factory2 = new Function('React', '"use strict";' + sourceCode + '\n;return arguments.callee.caller;');
    }
    const wrapped = function DynamicComp(props) {
      try {
        return React.createElement(Comp, props);
      } catch (e) {
        return React.createElement('div', { style: { padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px' } },
          '⚠️ 组件渲染错误：' + e.message
        );
      }
    };
    wrapped.displayName = `Dynamic(${componentName || 'Component'})`;
    componentCache.set(cacheKey, wrapped);
    return wrapped;
  } catch (e) {
    console.error('[DynamicRenderer] 编译失败:', e, '\nsource:', sourceCode);
    const Fallback = function (props) {
      return React.createElement('div', { style: { padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px' } },
        React.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, '❌ 组件编译失败：' + componentName),
        React.createElement('pre', { style: { fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap' } }, e.message)
      );
    };
    return Fallback;
  }
}

export function DynamicRenderer({ sourceCode, componentName, props, fallback }) {
  const Comp = useMemo(() => compileComponent(sourceCode, componentName), [sourceCode, componentName]);
  try {
    return React.createElement(Comp, props || {});
  } catch (e) {
    return fallback || React.createElement('div', { style: { padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px' } },
      '组件渲染异常: ' + e.message
    );
  }
}

export function LayoutRenderer({ nodes, onPropsChange, editable }) {
  if (!nodes || nodes.length === 0) {
    return React.createElement('div', { style: { padding: '60px 20px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #cbd5e1', borderRadius: '12px' } },
      '🎯 请输入内容意图描述，让 AI 为你推荐组件组合...'
    );
  }
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
    nodes.map((node, idx) => {
      const nodeWithScore = React.createElement('div', { key: node.id, style: { position: 'relative' } },
        editable && React.createElement('div', { style: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0', fontSize: '12px' } },
          React.createElement('div', null,
            React.createElement('span', { style: { fontWeight: 700, color: '#1e293b' } }, node.component_name || '组件'),
            React.createElement('span', { style: { marginLeft: '8px', color: '#64748b' } }, '@' + (node.version || '?')),
            React.createElement('span', { style: { marginLeft: '12px', color: '#94a3b8' } }, '#', idx + 1)
          ),
          React.createElement('div', null,
            React.createElement('span', { style: { padding: '2px 10px', borderRadius: '999px', fontWeight: 600, fontSize: '11px',
              background: node.match_score >= 0.6 ? '#dcfce7' : node.match_score >= 0.4 ? '#fef9c3' : '#fee2e2',
              color: node.match_score >= 0.6 ? '#166534' : node.match_score >= 0.4 ? '#854d0e' : '#991b1b'
            } },
              '🎯 匹配度: ' + (node.match_score != null ? (node.match_score * 100).toFixed(1) + '%' : 'N/A')
            )
          )
        ),
        React.createElement('div', { style: { background: 'white', border: editable ? '1px solid #e2e8f0' : 'none', borderTop: editable ? 'none' : undefined, borderRadius: editable ? '0 0 8px 8px' : undefined, padding: editable ? '16px' : 0 } },
          node.component && node.component.source_code
            ? React.createElement(DynamicRenderer, { sourceCode: node.component.source_code, componentName: node.component.name, props: node.props })
            : React.createElement(DynamicRenderer, { sourceCode: node._source_code || (node.component && node.component.source_code), componentName: node.component_name, props: node.props })
        ),
        editable && onPropsChange && React.createElement('details', { style: { marginTop: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' } },
          React.createElement('summary', { style: { cursor: 'pointer', color: '#475569', fontWeight: 600 } }, '⚙️ 编辑组件 Props (JSON)'),
          React.createElement('textarea', {
            style: { width: '100%', minHeight: '100px', marginTop: '8px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '12px' },
            value: JSON.stringify(node.props, null, 2),
            onChange: (e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onPropsChange(node.id, parsed);
              } catch (_) {}
            }
          })
        )
      );
      return nodeWithScore;
    })
  );
}

export default DynamicRenderer;
