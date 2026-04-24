import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import {
  deleteBook,
  deletePage,
  getBookWithPages,
  getImageAttempt,
  getCoverAttempt,
  getPage,
  insertBook,
  insertImageAttempt,
  insertCoverAttempt,
  insertPages,
  listBooks,
  listImageAttempts,
  listCoverAttempts,
  updateImageApproval,
  updateCoverApproval,
  updateBook,
  updatePage,
  deleteImageAttempt,
  deleteCoverAttempt,
  updateBookCoverUrl,
  getAdminSetting,
  setAdminSetting,
  logGeneration,
  getGenerationStats,
} from './db.js';
import { saveDataUrl, uploadsDir } from './lib/storage.js';
import { verifyCredentials, issueToken, requireAuth, requireAdmin } from './lib/auth.js';
import { ALL_MODELS, PROVIDER_MAP, generators, generateWithOpenAI } from '../shared/image-providers.js';
import { evaluatePrompt } from '../shared/prompt-evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.PUBLIC_BASE_URL || '';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// Valid Gemini chat model identifiers (e.g. gemini-2.0-flash, gemini-2.5-pro-exp-03-25)
const GEMINI_CHAT_MODEL_RE = /^gemini-[\w.-]{1,60}$/;

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : {}));
  app.use(express.json({ limit: '10mb' }));

  // Static uploads
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  const PORT = process.env.PORT || 8788;
  const DEFAULT_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';

  // ---------- Helpers ----------

  const ensureGeminiKey = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Missing GEMINI_API_KEY');
    return key;
  };

  const slugify = value =>
    (value || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item';

  const extensionFromUrl = url => {
    try {
      const pathname = new URL(url, 'http://localhost').pathname;
      const match = pathname.match(/\.(png|jpe?g|webp|gif)$/i);
      return match ? match[0] : '.png';
    } catch {
      return '.png';
    }
  };

  const formatGeminiMessages = messages =>
    messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  const callGemini = async ({ messages = [], model = DEFAULT_CHAT_MODEL }) => {
    const apiKey = ensureGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: formatGeminiMessages(messages),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini error ${resp.status}: ${errText}`);
    }
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return { text: parts.map(p => p.text).join(' ').trim() };
  };

  // ---------- Public routes ----------

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await verifyCredentials(email, password);
      if (!user) return res.status(401).json({ error: 'invalid credentials' });
      const token = issueToken(user);
      res.json({ token, user });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  // ---------- Authenticated /api/* ----------

  const api = express.Router();
  api.use(requireAuth);

  api.get('/auth/me', (req, res) => res.json({ user: req.user }));

  // ---- Books ----

  api.get('/books', (req, res) => {
    res.json({ books: listBooks() });
  });

  api.get('/books/:id', (req, res) => {
    const book = getBookWithPages(req.params.id);
    if (!book) return res.status(404).json({ error: 'Not found' });
    res.json({ book });
  });

  api.post('/books', (req, res) => {
    const { title, concept = '', tagLine = '', audience = '', pages = [] } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const book = insertBook({ title, concept, tagLine, audience });
    if (pages.length) insertPages(book.id, pages);
    res.status(201).json({ book: getBookWithPages(book.id) });
  });

  api.put('/books/:id', (req, res) => {
    const updated = updateBook(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json({ book: updated });
  });

  api.delete('/books/:id', (req, res) => {
    deleteBook(req.params.id);
    res.status(204).end();
  });

  api.post('/books/:id/pages', (req, res) => {
    const bookId = Number(req.params.id);
    if (!bookId) return res.status(400).json({ error: 'invalid book id' });
    const { pages = [] } = req.body || {};
    if (!Array.isArray(pages) || !pages.length)
      return res.status(400).json({ error: 'pages array required' });
    const book = getBookWithPages(bookId);
    if (!book) return res.status(404).json({ error: 'book not found' });
    res.status(201).json({ pages: insertPages(bookId, pages) });
  });

  api.get('/books/:id/download', async (req, res) => {
    const bookId = Number(req.params.id);
    if (!bookId) return res.status(400).json({ error: 'invalid book id' });
    const book = getBookWithPages(bookId);
    if (!book) return res.status(404).json({ error: 'book not found' });

    const pages = book.pages || [];
    if (!pages.length) return res.status(400).json({ error: 'book has no pages to download' });

    const missingPages = pages.filter(p => !p.image_url);
    const missingCover = book.cover_url ? [] : ['cover'];
    const missingCount = missingPages.length + missingCover.length;
    if (missingCount) {
      const names = [
        ...missingPages.map(p => `page ${p.id}`),
        ...missingCover.map(() => 'cover'),
      ].join(', ');
      return res.status(400).json({
        error: `${missingCount} item(s) missing approved images: ${names}`,
      });
    }

    const fetchToBuffer = async (url) => {
      // Local /uploads URLs come through express.static; resolve via filesystem.
      if (url.startsWith('/uploads/')) {
        const filename = url.replace(/^\/uploads\//, '');
        const fullPath = path.join(uploadsDir, filename);
        return { buffer: await import('fs').then(f => f.promises.readFile(fullPath)), ext: extensionFromUrl(url) };
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`fetch ${url} failed (${resp.status})`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      return { buffer, ext: extensionFromUrl(url) };
    };

    try {
      const files = [];
      if (book.cover_url) {
        const { buffer, ext } = await fetchToBuffer(book.cover_url);
        files.push({ name: `00-cover${ext}`, buffer });
      }
      for (const page of pages) {
        const { buffer, ext } = await fetchToBuffer(page.image_url);
        const name = `${String(page.sort_order ?? page.id ?? files.length + 1).padStart(2, '0')}-${slugify(page.title || 'page')}${ext}`;
        files.push({ name, buffer });
      }

      const bundleName = `${slugify(book.title || 'book') || 'book'}-approved-images.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${bundleName}"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', err => { console.error('Archive error:', err); res.status(500).end('Archive failed.'); });
      archive.pipe(res);
      files.forEach(f => archive.append(f.buffer, { name: f.name }));
      archive.finalize();
    } catch (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Download failed.' });
    }
  });

  // ---- Pages ----

  api.put('/pages/:id', (req, res) => {
    const pageId = Number(req.params.id);
    if (!pageId) return res.status(400).json({ error: 'invalid page id' });
    const updated = updatePage(pageId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json({ page: updated });
  });

  api.delete('/pages/:id', (req, res) => {
    deletePage(req.params.id);
    res.status(204).end();
  });

  // ---- Page image attempts ----

  api.get('/pages/:id/images', (req, res) => {
    const pageId = Number(req.params.id);
    if (!pageId) return res.status(400).json({ error: 'invalid page id' });
    const page = getPage(pageId);
    if (!page) return res.status(404).json({ error: 'page not found' });
    res.json({ images: listImageAttempts(pageId) });
  });

  api.post('/pages/:id/images', async (req, res) => {
    try {
      const pageId = Number(req.params.id);
      if (!pageId) return res.status(400).json({ error: 'invalid page id' });
      const page = getPage(pageId);
      if (!page) return res.status(404).json({ error: 'page not found' });
      const { dataUrl } = req.body || {};
      if (!dataUrl || !dataUrl.startsWith('data:image/'))
        return res.status(400).json({ error: 'dataUrl image required' });
      const upload = await saveDataUrl(dataUrl, { folder: `page-${pageId}` });
      const attempt = insertImageAttempt(pageId, upload.secure_url);
      res.status(201).json({ image: attempt });
    } catch (err) {
      console.error('Page image upload error:', err);
      res.status(500).json({ error: 'Image upload failed.' });
    }
  });

  api.post('/pages/:pageId/images/:imageId/approve', (req, res) => {
    const pageId = Number(req.params.pageId);
    const imageId = Number(req.params.imageId);
    if (!pageId || !imageId) return res.status(400).json({ error: 'invalid ids' });
    const page = getPage(pageId);
    if (!page) return res.status(404).json({ error: 'page not found' });
    const attempt = getImageAttempt(imageId);
    if (!attempt || attempt.page_id !== pageId)
      return res.status(404).json({ error: 'image not found' });
    const { approved = true } = req.body || {};
    const updated = updateImageApproval(imageId, approved);
    if (approved) updatePage(pageId, { imageUrl: updated.url });
    res.json({ image: updated });
  });

  api.delete('/pages/:pageId/images/:imageId', (req, res) => {
    const pageId = Number(req.params.pageId);
    const imageId = Number(req.params.imageId);
    if (!pageId || !imageId) return res.status(400).json({ error: 'invalid ids' });
    const attempt = getImageAttempt(imageId);
    if (!attempt || attempt.page_id !== pageId)
      return res.status(404).json({ error: 'image not found' });
    deleteImageAttempt(imageId);
    res.status(204).end();
  });

  // ---- Cover image attempts ----

  api.get('/books/:id/cover/images', (req, res) => {
    const bookId = Number(req.params.id);
    if (!bookId) return res.status(400).json({ error: 'invalid book id' });
    const book = getBookWithPages(bookId);
    if (!book) return res.status(404).json({ error: 'book not found' });
    res.json({ images: listCoverAttempts(bookId) });
  });

  api.post('/books/:id/cover/images', async (req, res) => {
    try {
      const bookId = Number(req.params.id);
      if (!bookId) return res.status(400).json({ error: 'invalid book id' });
      const book = getBookWithPages(bookId);
      if (!book) return res.status(404).json({ error: 'book not found' });
      const { dataUrl } = req.body || {};
      if (!dataUrl || !dataUrl.startsWith('data:image/'))
        return res.status(400).json({ error: 'dataUrl image required' });
      const upload = await saveDataUrl(dataUrl, { folder: `cover-${bookId}` });
      const attempt = insertCoverAttempt(bookId, upload.secure_url);
      res.status(201).json({ image: attempt });
    } catch (err) {
      console.error('Cover image upload error:', err);
      res.status(500).json({ error: 'Image upload failed.' });
    }
  });

  api.post('/books/:bookId/cover/images/:imageId/approve', (req, res) => {
    const bookId = Number(req.params.bookId);
    const imageId = Number(req.params.imageId);
    if (!bookId || !imageId) return res.status(400).json({ error: 'invalid ids' });
    const attempt = getCoverAttempt(imageId);
    if (!attempt || attempt.book_id !== bookId)
      return res.status(404).json({ error: 'image not found' });
    const { approved = true } = req.body || {};
    const updated = updateCoverApproval(imageId, approved);
    updateBookCoverUrl(bookId, approved ? updated.url : '');
    res.json({ image: updated });
  });

  api.delete('/books/:bookId/cover/images/:imageId', (req, res) => {
    const bookId = Number(req.params.bookId);
    const imageId = Number(req.params.imageId);
    if (!bookId || !imageId) return res.status(400).json({ error: 'invalid ids' });
    const attempt = getCoverAttempt(imageId);
    if (!attempt || attempt.book_id !== bookId)
      return res.status(404).json({ error: 'image not found' });
    deleteCoverAttempt(imageId);
    res.status(204).end();
  });

  // ---- Settings (per "user" — single admin in self-host) ----

  api.get('/settings', (req, res) => {
    const enabledModels = getAdminSetting('enabled_models') || ALL_MODELS.map(m => m.id);
    const evaluatorEnabled = getAdminSetting('prompt_evaluator_enabled');
    res.json({
      models: ALL_MODELS,
      enabledModels,
      promptEvaluatorEnabled: evaluatorEnabled !== false,
      defaultChatModel: DEFAULT_CHAT_MODEL,
    });
  });

  // ---- Generate image ----

  api.post('/generate-image', async (req, res) => {
    try {
      const {
        prompt, modelId, refinementFeedback, isCover, previewOnly,
        skipEvaluator, characterStyle, bookTitle, pageNumber, totalPages, pageId,
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string')
        return res.status(400).json({ error: 'prompt is required' });
      if (prompt.length > 5000)
        return res.status(400).json({ error: 'prompt too long (max 5000 chars)' });

      const enabledModels = getAdminSetting('enabled_models') || ALL_MODELS.map(m => m.id);
      const resolvedModelId = enabledModels.includes(modelId) ? modelId : enabledModels[0];
      if (!resolvedModelId) return res.status(400).json({ error: 'No image models enabled' });

      const provider = PROVIDER_MAP[resolvedModelId] || 'openai';
      const modelInfo = ALL_MODELS.find(m => m.id === resolvedModelId);

      let finalPrompt = prompt;
      let optimizedPrompt = null;
      let cached = false;

      if (!skipEvaluator) {
        const evaluatorEnabled = getAdminSetting('prompt_evaluator_enabled') !== false;
        const shouldEvaluate = evaluatorEnabled || refinementFeedback;

        if (shouldEvaluate && pageId && !refinementFeedback && !isCover) {
          const pageRow = getPage(pageId);
          if (pageRow?.optimized_prompt) {
            finalPrompt = pageRow.optimized_prompt;
            optimizedPrompt = pageRow.optimized_prompt;
            cached = true;
          }
        }

        if (shouldEvaluate && !cached) {
          try {
            const evalResult = await evaluatePrompt(prompt, {
              refinementFeedback, isCover: !!isCover, characterStyle, bookTitle, pageNumber, totalPages,
            });
            finalPrompt = evalResult.optimizedPrompt || prompt;
            optimizedPrompt = finalPrompt;
            try { logGeneration('prompt-evaluator', 0.01, req.user.email); } catch { /* best effort */ }
            if (pageId && !isCover && optimizedPrompt) {
              try { updatePage(pageId, { optimizedPrompt }); } catch { /* best effort */ }
            }
          } catch (e) {
            console.error('Prompt evaluator failed, using original prompt:', e.message);
          }
        }
      }

      if (previewOnly) {
        return res.json({ optimizedPrompt: optimizedPrompt || prompt, cached });
      }

      const generate = generators[provider] || generateWithOpenAI;
      const result = await generate(finalPrompt, resolvedModelId);
      if (result.error) return res.status(502).json({ error: result.error });

      try { logGeneration(resolvedModelId, modelInfo?.costCents || 0, req.user.email); }
      catch { /* best effort */ }

      res.json({ dataUrl: result.dataUrl, optimizedPrompt });
    } catch (err) {
      console.error('Image generation error:', err);
      res.status(500).json({ error: 'Image generation failed unexpectedly' });
    }
  });

  // ---- Chat (streaming) ----

  api.post('/chat', async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    });
    const close = () => res.end();
    try {
      const { messages = [], model: rawModel = DEFAULT_CHAT_MODEL, systemContext } = req.body || {};
      if (!messages.length) { res.write('Error: messages array required'); return close(); }
      const model = GEMINI_CHAT_MODEL_RE.test(rawModel) ? rawModel : DEFAULT_CHAT_MODEL;
      const apiKey = ensureGeminiKey();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const allMessages = systemContext
        ? [{ role: 'user', content: systemContext }, ...messages]
        : messages;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: formatGeminiMessages(allMessages),
          generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
        }),
      });
      if (!upstream.ok) {
        const errText = await upstream.text();
        res.write(`Error: ${errText}`); return close();
      }
      const reader = upstream.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const flushChunks = chunk => {
        buffer += chunk;
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        events.forEach(evt => {
          const line = evt.trim();
          if (!line.startsWith('data:')) return;
          const payload = line.replace(/^data:\s*/, '');
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const text = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text).join('');
            if (text) res.write(text);
          } catch { /* ignore */ }
        });
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        flushChunks(decoder.decode(value, { stream: true }));
      }
      close();
    } catch (err) {
      console.error('Chat stream error:', err); res.write('Error: Chat failed.'); close();
    }
  });

  // ---- Ideas ----

  api.post('/ideas', async (req, res) => {
    try {
      const { theme = '', audience = 'kids', length = 8 } = req.body || {};
      const prompt = `You are a coloring book planner. Propose a book concept and ${length} scenes with concise prompts. Respond in JSON with keys: title, tagLine, concept, pages (array of {title, scene, prompt}). Keep prompts coloring-book friendly.`;
      const messages = [
        { role: 'user', content: prompt },
        theme ? { role: 'user', content: `Theme: ${theme}` } : null,
        { role: 'user', content: `Audience: ${audience}. Scenes: ${length}.` },
      ].filter(Boolean);
      const { text } = await callGemini({ messages });
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      res.json({ idea: parsed, raw: text });
    } catch (err) {
      console.error('Ideas error:', err);
      res.status(500).json({ error: 'Failed to generate ideas.' });
    }
  });

  api.post('/ideas/page', async (req, res) => {
    try {
      const { bookConcept = '', pageTitle = '', existingPrompts = [], audience = 'kids' } = req.body || {};
      const prompt = `You are a coloring book scene designer. Given a book concept and an upcoming page title, write a single scene description and an image prompt for that page. Respond in JSON: {"scene": "...", "prompt": "..."}. Keep the prompt coloring-book friendly. Avoid duplicating these existing prompts: ${JSON.stringify(existingPrompts).slice(0, 600)}.`;
      const messages = [
        { role: 'user', content: prompt },
        { role: 'user', content: `Book concept: ${bookConcept}\nPage title: ${pageTitle}\nAudience: ${audience}` },
      ];
      const { text } = await callGemini({ messages });
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      res.json({ idea: parsed, raw: text });
    } catch (err) {
      console.error('Ideas/page error:', err);
      res.status(500).json({ error: 'Failed to generate page idea.' });
    }
  });

  // ---- Admin ----

  api.get('/admin/stats', requireAdmin, (req, res) => {
    res.json(getGenerationStats());
  });

  api.get('/admin/models', requireAdmin, (req, res) => {
    const enabled = getAdminSetting('enabled_models') || ALL_MODELS.map(m => m.id);
    res.json({ models: ALL_MODELS, enabledModels: enabled });
  });

  api.put('/admin/models', requireAdmin, (req, res) => {
    const { enabledModels } = req.body || {};
    if (!Array.isArray(enabledModels)) return res.status(400).json({ error: 'enabledModels array required' });
    const valid = enabledModels.filter(id => ALL_MODELS.some(m => m.id === id));
    setAdminSetting('enabled_models', valid);
    res.json({ enabledModels: valid });
  });

  api.put('/admin/settings', requireAdmin, (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    setAdminSetting(key, value);
    res.json({ key, value });
  });

  app.use('/api', api);

  return { app, port: PORT };
};

// Boot only when run directly, not when imported by tests.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { app, port } = createApp();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}
