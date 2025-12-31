import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
  updatePage,
  deleteImageAttempt,
  deleteCoverAttempt,
  updateBookCoverUrl,
} from './db.js';
import { v2 as cloudinary } from 'cloudinary';
import archiver from 'archiver';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8788;
const DEFAULT_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';
const DEFAULT_CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || 'coloring-book-studio';

let cloudinaryConfigured = false;

const ensureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Missing Cloudinary env vars');
  }
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });
    cloudinaryConfigured = true;
  }
};

const ensureApiKey = () => {
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
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(png|jpe?g|webp|gif)$/i);
    return match ? match[0] : '.png';
  } catch {
    return '.png';
  }
};

const formatMessages = messages =>
  messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

const callGemini = async ({ messages = [], model = DEFAULT_CHAT_MODEL }) => {
  const apiKey = ensureApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: formatMessages(messages),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1200,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map(p => p.text)
    .join(' ')
    .trim();
  return { model, text, raw: data };
};

const uploadToCloudinary = async (
  dataUrl,
  folder = DEFAULT_CLOUDINARY_FOLDER
) => {
  ensureCloudinary();
  const res = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: 'image',
    overwrite: false,
  });
  return res;
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/books', (req, res) => {
  const books = listBooks();
  res.json({ books });
});

app.get('/api/books/:id', (req, res) => {
  const book = getBookWithPages(req.params.id);
  if (!book) return res.status(404).json({ error: 'Not found' });
  res.json({ book });
});

app.get('/api/books/:id/download', async (req, res) => {
  const bookId = Number(req.params.id);
  if (!bookId) return res.status(400).json({ error: 'invalid book id' });

  const book = getBookWithPages(bookId);
  if (!book) return res.status(404).json({ error: 'book not found' });

  const pages = book.pages || [];
  if (!pages.length)
    return res.status(400).json({ error: 'book has no pages to download' });

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

  try {
    const files = [];

    if (book.cover_url) {
      const response = await fetch(book.cover_url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch cover image (status ${response.status})`
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = extensionFromUrl(book.cover_url);
      files.push({ name: `00-cover${ext}`, buffer });
    }

    for (const page of pages) {
      const url = page.image_url;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image for page ${page.id} (status ${response.status})`
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = extensionFromUrl(url);
      const name = `${String(
        page.sort_order ?? page.id ?? files.length + 1
      ).padStart(2, '0')}-${slugify(page.title || 'page')}${ext}`;
      files.push({ name, buffer });
    }

    const bundleName = `${
      slugify(book.title || 'book') || 'book'
    }-approved-images.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${bundleName}"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      res.status(500).end(err.message);
    });

    archive.pipe(res);
    files.forEach(file => archive.append(file.buffer, { name: file.name }));
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books', (req, res) => {
  const { title, concept = '', tagLine = '', pages = [] } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  const book = insertBook({ title, concept, tagLine });
  if (pages.length) {
    insertPages(book.id, pages);
  }
  const withPages = getBookWithPages(book.id);
  res.status(201).json({ book: withPages });
});

app.post('/api/books/:id/pages', (req, res) => {
  const bookId = Number(req.params.id);
  if (!bookId) return res.status(400).json({ error: 'invalid book id' });
  const { pages = [] } = req.body || {};
  if (!Array.isArray(pages) || !pages.length)
    return res.status(400).json({ error: 'pages array required' });
  const book = getBookWithPages(bookId);
  if (!book) return res.status(404).json({ error: 'book not found' });
  const inserted = insertPages(bookId, pages);
  res.status(201).json({ pages: inserted });
});

app.get('/api/pages/:id/images', (req, res) => {
  const pageId = Number(req.params.id);
  if (!pageId) return res.status(400).json({ error: 'invalid page id' });
  const page = getPage(pageId);
  if (!page) return res.status(404).json({ error: 'page not found' });
  const images = listImageAttempts(pageId);
  res.json({ images });
});

app.post('/api/pages/:id/images', async (req, res) => {
  try {
    const pageId = Number(req.params.id);
    if (!pageId) return res.status(400).json({ error: 'invalid page id' });
    const page = getPage(pageId);
    if (!page) return res.status(404).json({ error: 'page not found' });
    const { dataUrl } = req.body || {};
    if (!dataUrl || !dataUrl.startsWith('data:image/'))
      return res.status(400).json({ error: 'dataUrl image required' });

    const upload = await uploadToCloudinary(dataUrl);
    const attempt = insertImageAttempt(pageId, upload.secure_url);
    res.status(201).json({ image: attempt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/books/:id/cover/images', (req, res) => {
  const bookId = Number(req.params.id);
  if (!bookId) return res.status(400).json({ error: 'invalid book id' });
  const book = listBooks().find(b => Number(b.id) === bookId);
  if (!book) return res.status(404).json({ error: 'book not found' });
  const images = listCoverAttempts(bookId);
  res.json({ images });
});

app.post('/api/books/:id/cover/images', async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    if (!bookId) return res.status(400).json({ error: 'invalid book id' });
    const book = listBooks().find(b => Number(b.id) === bookId);
    if (!book) return res.status(404).json({ error: 'book not found' });
    const { dataUrl } = req.body || {};
    if (!dataUrl || !dataUrl.startsWith('data:image/'))
      return res.status(400).json({ error: 'dataUrl image required' });

    const upload = await uploadToCloudinary(dataUrl);
    const attempt = insertCoverAttempt(bookId, upload.secure_url);
    res.status(201).json({ image: attempt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books/:bookId/cover/images/:imageId/approve', (req, res) => {
  const bookId = Number(req.params.bookId);
  const imageId = Number(req.params.imageId);
  if (!bookId || !imageId)
    return res.status(400).json({ error: 'invalid ids' });
  const attempt = getCoverAttempt(imageId);
  if (!attempt || attempt.book_id !== bookId)
    return res.status(404).json({ error: 'image not found' });
  const { approved = true } = req.body || {};
  const updated = updateCoverApproval(imageId, approved);
  if (approved) {
    updateBookCoverUrl(bookId, updated.url);
  } else {
    updateBookCoverUrl(bookId, '');
  }
  res.json({ image: updated });
});

app.delete('/api/books/:bookId/cover/images/:imageId', (req, res) => {
  const bookId = Number(req.params.bookId);
  const imageId = Number(req.params.imageId);
  if (!bookId || !imageId)
    return res.status(400).json({ error: 'invalid ids' });
  const attempt = getCoverAttempt(imageId);
  if (!attempt || attempt.book_id !== bookId)
    return res.status(404).json({ error: 'image not found' });
  deleteCoverAttempt(imageId);
  res.status(204).end();
});

app.post('/api/pages/:pageId/images/:imageId/approve', (req, res) => {
  const pageId = Number(req.params.pageId);
  const imageId = Number(req.params.imageId);
  if (!pageId || !imageId)
    return res.status(400).json({ error: 'invalid ids' });
  const page = getPage(pageId);
  if (!page) return res.status(404).json({ error: 'page not found' });
  const attempt = getImageAttempt(imageId);
  if (!attempt || attempt.page_id !== pageId)
    return res.status(404).json({ error: 'image not found' });
  const { approved = true } = req.body || {};
  const updated = updateImageApproval(imageId, approved);
  if (approved) {
    updatePage(pageId, { imageUrl: updated.url });
  }
  res.json({ image: updated });
});

app.delete('/api/pages/:pageId/images/:imageId', (req, res) => {
  const pageId = Number(req.params.pageId);
  const imageId = Number(req.params.imageId);
  if (!pageId || !imageId)
    return res.status(400).json({ error: 'invalid ids' });
  const attempt = getImageAttempt(imageId);
  if (!attempt || attempt.page_id !== pageId)
    return res.status(404).json({ error: 'image not found' });
  deleteImageAttempt(imageId);
  res.status(204).end();
});

app.put('/api/pages/:id', (req, res) => {
  const pageId = Number(req.params.id);
  if (!pageId) return res.status(400).json({ error: 'invalid page id' });
  const updated = updatePage(pageId, req.body || {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json({ page: updated });
});

app.delete('/api/books/:id', (req, res) => {
  deleteBook(req.params.id);
  res.status(204).end();
});

app.delete('/api/pages/:id', (req, res) => {
  deletePage(req.params.id);
  res.status(204).end();
});

app.post('/api/chat', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  });

  const close = () => {
    res.end();
  };

  try {
    const {
      messages = [],
      model = DEFAULT_CHAT_MODEL,
      systemContext,
    } = req.body || {};
    if (!messages.length) {
      res.write('Error: messages array required');
      return close();
    }

    const apiKey = ensureApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Prepend system context as first user message if provided
    const allMessages = systemContext
      ? [{ role: 'user', content: systemContext }, ...messages]
      : messages;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: formatMessages(allMessages),
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1200,
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`Error: ${errText}`);
      return close();
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
          const textParts = json.candidates?.[0]?.content?.parts ?? [];
          const text = textParts.map(p => p.text).join('');
          if (text) {
            res.write(text);
          }
        } catch {
          // ignore parse errors from upstream keep-alives
        }
      });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      flushChunks(decoder.decode(value, { stream: true }));
    }

    close();
  } catch (err) {
    res.write(`Error: ${err.message}`);
    close();
  }
});

app.post('/api/ideas', async (req, res) => {
  try {
    const { theme = '', audience = 'kids', length = 8 } = req.body || {};
    const prompt = `You are a coloring book planner. Propose a book concept and ${length} scenes with concise prompts. Respond in JSON with keys: title, tagLine, concept, pages (array of {title, scene, prompt}). Keep prompts coloring-book friendly.`;
    const messages = [
      { role: 'user', content: prompt },
      theme ? { role: 'user', content: `Theme: ${theme}` } : null,
      { role: 'user', content: `Audience: ${audience}. Scenes: ${length}.` },
    ].filter(Boolean);
    const { text } = await callGemini({ messages, model: DEFAULT_CHAT_MODEL });
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    res.json({ idea: parsed, raw: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
