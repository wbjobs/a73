import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.remoteHost = 'https://hf-mirror.com';
env.remotePathTemplate = '{model}/resolve/{revision}/{file}';
env.fetchOptions = { timeout: 60000 };

let embedder = null;
const VECTOR_DIM = 384;
let useFallback = false;

const FALLBACK_VOCAB = buildFallbackVocab();

function buildFallbackVocab() {
  const words = [
    '科技','新闻','时间线','时间','里程碑','事件','历程','发展','节点','顺序','按时间',
    '图片','图像','照片','配图','图注','说明','展示','画廊','图集','多图','网格','相册',
    '代码','程序','代码块','语法','示例','片段','javascript','python','函数','编程',
    '正文','段落','长文本','文章','排版','阅读','内容','详细',
    '标题','副标题','头图','页头','眉毛','栏目','导航','开头','顶部',
    '卡片','摘要','标签','发布','资讯','日期','时间',
    '引用','引言','观点','金句','专家','突出',
    '要点','核心','关键','清单','列表','摘要','总结',
    '视频','播放器','演示','发布会','产品',
    '布局','结构','容器','组件','媒体','交互','内容'
  ];
  const vocab = {};
  words.forEach((w, i) => { vocab[w] = i; });
  vocab.__size__ = words.length;
  return vocab;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function tokenizeChinese(text) {
  const tokens = [];
  const vocab = FALLBACK_VOCAB;
  for (const w of Object.keys(vocab)) {
    if (w === '__size__') continue;
    if (text.includes(w)) tokens.push(w);
  }
  const english = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  return tokens.concat(english);
}

function fallbackEmbedding(text) {
  const dim = VECTOR_DIM;
  const vec = new Array(dim).fill(0);
  const tokens = tokenizeChinese(String(text));
  if (tokens.length === 0) {
    for (let i = 0; i < dim; i++) vec[i] = (hashString(text + ':' + i) - 0.5) * 0.01;
    return normalize(vec);
  }
  for (const tok of tokens) {
    const seed = tok.length + tok.charCodeAt(0);
    for (let i = 0; i < dim; i++) {
      const v = (hashString(tok + '|' + i) - 0.5) * 0.3;
      vec[i] += v;
    }
  }
  for (let i = 0; i < dim; i++) vec[i] = Math.tanh(vec[i] / Math.sqrt(tokens.length + 1));
  return normalize(vec);
}

function normalize(vec) {
  let n = 0;
  for (const v of vec) n += v * v;
  n = Math.sqrt(n) || 1;
  return vec.map(v => v / n);
}

export async function initEmbedder() {
  if (embedder) return embedder;
  if (useFallback) return null;
  console.log('[Semantic] Loading embedding model: Xenova/all-MiniLM-L6-v2 via mirror...');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
        progress_callback: (p) => {
          if (p.status === 'download') {
            console.log(`[Semantic] Downloading ${p.file}... ${(p.progress || 0).toFixed(0)}%`);
          }
        },
      });
      clearTimeout(timeout);
      console.log('[Semantic] Transformer embedding model loaded successfully.');
    } catch (innerErr) {
      clearTimeout(timeout);
      throw innerErr;
    }
  } catch (e) {
    console.warn('[Semantic] Failed to load transformer model. Using lightweight semantic fallback vectorizer.',
      e.message?.split('\n')[0] || e);
    useFallback = true;
    embedder = null;
  }
  return embedder;
}

export async function getEmbedding(text) {
  await initEmbedder();
  if (!embedder || useFallback) {
    return fallbackEmbedding(text);
  }
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (e) {
    console.warn('[Semantic] Embedder error, using fallback:', e.message);
    return fallbackEmbedding(text);
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorToBuffer(vec) {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer);
}

export function bufferToVector(buf) {
  if (!buf) return null;
  const u8 = buf instanceof Buffer ? buf : Buffer.from(buf);
  const f32 = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
  return Array.from(f32);
}

export { VECTOR_DIM };
