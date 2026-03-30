import { getUserId, getUserEmail } from '../lib/auth.js';
import { getCorsHeaders, json } from '../lib/cors.js';
import {
  ensureSchema, ensureAdmin, isAdmin,
  getAdminSetting, setAdminSetting, getGenerationStats,
} from '../lib/db.js';
import { loadSecrets } from '../lib/secrets.js';
import { handleBooks } from './routes/books.js';
import { handlePages } from './routes/pages.js';
import { handleImages } from './routes/images.js';
import { handleGenerateImage, ALL_MODELS } from './routes/generate-image.js';

export const handler = async (event) => {
  const origin = event.headers?.origin || '';

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }

  try {
    await loadSecrets();
    await ensureSchema();
    const userId = getUserId(event);
    const method = event.requestContext?.http?.method || 'GET';
    const path = event.rawPath || event.requestContext?.http?.path || '';
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};

    const userEmail = getUserEmail(event);
    const ctx = { userId, userEmail, method, path, body, event, origin };

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

    // POST /api/chat — HTTP fallback for chat when WebSocket is unavailable
    if (path === '/api/chat' && method === 'POST') {
      const { chatCompletion } = await import('../lib/openrouter.js');
      const { messages: chatMessages = [], systemContext } = body;
      if (!chatMessages.length || chatMessages.length > 100) {
        return json(400, { error: 'Invalid messages' }, origin);
      }
      const allMessages = [];
      if (systemContext) {
        allMessages.push({ role: 'system', content: String(systemContext).slice(0, 8000) });
      }
      for (const m of chatMessages) {
        allMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 10000),
        });
      }
      const text = await chatCompletion(allMessages);
      return json(200, { content: text }, origin);
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
      const sceneCount = Math.max(1, Math.min(50, Number(length) || 20));

      const systemPrompt = 'You are a coloring book planner. Propose a book concept and page scenes. Respond in JSON with keys: title, tagLine, concept, pages (array of {title, scene, prompt, caption}). "scene" is a short 1-sentence description of the page for display. "prompt" is a detailed image-generation prompt describing the illustration (subjects, composition, details). "caption" is a short fun activity instruction printed below the image (e.g. "Color the dragon and count its scales!"). Keep prompts coloring-book friendly.';
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

    // POST /api/ideas/page — regenerate a single page description
    if (path === '/api/ideas/page' && method === 'POST') {
      const { chatCompletion } = await import('../lib/openrouter.js');
      const { theme = '', audience = 'kids', pageIndex = 0, bookTitle = '', concept = '', existingPages = [] } = body;

      const pageList = existingPages.map((p, i) => `${i + 1}. ${p.title}: ${p.scene}`).join('\n');
      const systemPrompt = `You are a coloring book planner. Given the book context below, regenerate ONLY page ${Number(pageIndex) + 1}. Return JSON: {"title": "...", "scene": "...", "prompt": "...", "caption": "..."}. "scene" is a short 1-sentence description for display. "prompt" is a detailed image-generation prompt describing the illustration. "caption" is a short fun activity instruction printed below the image. Keep it coloring-book friendly and consistent with the other pages.`;
      const userContent = [
        bookTitle ? `Book: ${bookTitle}` : '',
        concept ? `Concept: ${concept}` : '',
        theme ? `Theme: ${String(theme).slice(0, 500)}` : '',
        `Audience: ${String(audience).slice(0, 100)}`,
        pageList ? `Existing pages:\n${pageList}` : '',
        `Regenerate page ${Number(pageIndex) + 1}.`,
      ].filter(Boolean).join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];
      const text = await chatCompletion(messages);
      let parsed;
      try {
        const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { title: `Page ${Number(pageIndex) + 1}`, scene: text, prompt: text };
      }
      return json(200, { page: parsed }, origin);
    }

    // GET /api/settings — returns enabled models + admin status
    if (path === '/api/settings' && method === 'GET') {
      // First user auto-becomes admin
      await ensureAdmin(userId);
      const admin = await isAdmin(userId);
      const enabledModels = (await getAdminSetting('enabled_models')) || ALL_MODELS.map(m => m.id);
      const models = ALL_MODELS.filter(m => enabledModels.includes(m.id));
      const defaultCoverModel = (await getAdminSetting('default_cover_model')) || null;
      const defaultPageModel = (await getAdminSetting('default_page_model')) || null;
      return json(200, { enabledModels: models, allModels: ALL_MODELS, isAdmin: admin, defaultCoverModel, defaultPageModel }, origin);
    }

    // GET /api/admin/stats — generation cost stats (admin only)
    if (path === '/api/admin/stats' && method === 'GET') {
      if (!(await isAdmin(userId))) return json(403, { error: 'Admin only' }, origin);
      const stats = await getGenerationStats();
      return json(200, { stats }, origin);
    }

    // PUT /api/admin/models — update enabled models + defaults (admin only)
    if (path === '/api/admin/models' && method === 'PUT') {
      if (!(await isAdmin(userId))) return json(403, { error: 'Admin only' }, origin);
      const { enabledModels, defaultCoverModel, defaultPageModel } = body;
      if (enabledModels !== undefined) {
        if (!Array.isArray(enabledModels)) return json(400, { error: 'enabledModels must be an array' }, origin);
        const validIds = ALL_MODELS.map(m => m.id);
        const filtered = enabledModels.filter(id => validIds.includes(id));
        if (!filtered.length) return json(400, { error: 'At least one model must be enabled' }, origin);
        await setAdminSetting('enabled_models', filtered);
      }
      if (defaultCoverModel !== undefined) await setAdminSetting('default_cover_model', defaultCoverModel);
      if (defaultPageModel !== undefined) await setAdminSetting('default_page_model', defaultPageModel);
      const currentEnabled = (await getAdminSetting('enabled_models')) || ALL_MODELS.map(m => m.id);
      return json(200, {
        enabledModels: currentEnabled,
        defaultCoverModel: await getAdminSetting('default_cover_model'),
        defaultPageModel: await getAdminSetting('default_page_model'),
      }, origin);
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
