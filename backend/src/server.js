import express from 'express';
import cors from 'cors';
import { initDB } from './db.js';
import { initEmbedder } from './semantic.js';
import componentsRouter from './routes/components.js';
import matchRouter from './routes/match.js';
import articlesRouter from './routes/articles.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/components', componentsRouter);
app.use('/api/match', matchRouter);
app.use('/api/articles', articlesRouter);

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message });
});

async function bootstrap() {
  await initDB();
  await initEmbedder();
  app.listen(PORT, () => {
    console.log(`[Server] Semantic CMS API running at http://localhost:${PORT}`);
  });
}

bootstrap();
