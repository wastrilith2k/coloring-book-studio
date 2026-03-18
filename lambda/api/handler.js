import { getUserId } from '../lib/auth.js';
import { getCorsHeaders, json } from '../lib/cors.js';
import { ensureSchema } from '../lib/db.js';
import { handleBooks } from './routes/books.js';
import { handlePages } from './routes/pages.js';
import { handleImages } from './routes/images.js';
import { handleGenerateImage } from './routes/generate-image.js';

export const handler = async (event) => {
  const origin = event.headers?.origin || '';

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }

  try {
    // Auto-create tables on first request (idempotent)
    await ensureSchema();
    const userId = getUserId(event);
    const method = event.requestContext?.http?.method || 'GET';
    const path = event.rawPath || event.requestContext?.http?.path || '';
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};

    const ctx = { userId, method, path, body, event, origin };

    // Route dispatch
    // GET /health
    if (path === '/health' && method === 'GET') {
      return json(200, { status: 'ok' }, origin);
    }

    // /api/books*
    if (path.startsWith('/api/books')) {
      return await handleBooks(ctx);
    }

    // /api/pages*
    if (path.startsWith('/api/pages')) {
      return await handlePages(ctx);
    }

    // POST /api/generate-image
    if (path === '/api/generate-image' && method === 'POST') {
      return await handleGenerateImage(ctx);
    }

    // POST /api/ideas
    if (path === '/api/ideas' && method === 'POST') {
      const { chatCompletion } = await import('../lib/openrouter.js');
      const { theme = '', audience = 'kids', length = 8 } = body;

      // Validate and clamp length
      const sceneCount = Math.max(1, Math.min(20, Number(length) || 8));

      const systemPrompt = 'You are a coloring book planner. Propose a book concept and page scenes with concise prompts. Respond in JSON with keys: title, tagLine, concept, pages (array of {title, scene, prompt}). Keep prompts coloring-book friendly.';
      const messages = [
        { role: 'system', content: systemPrompt },
        theme ? { role: 'user', content: `Theme: ${String(theme).slice(0, 500)}` } : null,
        { role: 'user', content: `Audience: ${String(audience).slice(0, 100)}. Scenes: ${sceneCount}.` },
      ].filter(Boolean);
      const text = await chatCompletion(messages);
      let parsed;
      try {
        const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { raw: text };
      }
      return json(200, { idea: parsed, raw: text }, origin);
    }

    return json(404, { error: 'Not found' }, origin);
  } catch (err) {
    console.error('Handler error:', err);
    if (err.message?.includes('Unauthorized')) {
      return json(401, { error: 'Unauthorized' }, origin);
    }
    return json(500, { error: 'Internal server error' }, origin);
  }
};
