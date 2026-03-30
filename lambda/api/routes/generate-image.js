import { json } from '../../lib/cors.js';
import { logGeneration, getAdminSetting } from '../../lib/db.js';

// --- Provider: Gemini ---

const GEMINI_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-image';

const BLOCKED_REASONS = new Set(['PROHIBITED_CONTENT', 'SAFETY', 'BLOCKED']);

const callGemini = async (url, prompt) => {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
};

const extractGeminiImage = async (res) => {
  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gemini API error ${res.status}:`, errText);
    if (res.status === 429) return { error: 'Rate limit exceeded. Please wait a moment and try again.' };
    if (res.status === 403) return { error: 'API quota exceeded or access denied.' };
    let detail = 'Image generation failed. Please try again.';
    try { const msg = JSON.parse(errText).error?.message; if (msg) detail = msg; } catch { /* use default */ }
    return { error: detail };
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (BLOCKED_REASONS.has(finishReason)) return { error: null, finishReason };

  const imagePart = candidate?.content?.parts?.find(p => p.inline_data || p.inlineData);
  const inlineData = imagePart?.inline_data || imagePart?.inlineData;
  if (!inlineData?.data) {
    console.error('Gemini response had no image data:', JSON.stringify(data).slice(0, 1500));
    return { error: 'No image returned from generation service.' };
  }

  const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
  return { dataUrl: `data:${mimeType};base64,${inlineData.data}` };
};

const generateWithGemini = async (prompt, modelId) => {
  const model = GEMINI_MODELS.includes(modelId) ? modelId : DEFAULT_GEMINI_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: 'Gemini not configured' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let res = await callGemini(url, prompt);
  let result = await extractGeminiImage(res);

  // If blocked for copyright/safety, retry with a sanitized prompt
  if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
    console.log(`[generate-image] Blocked (${result.finishReason}), retrying with sanitized prompt`);
    const sanitized = 'Create an original illustration (no copyrighted or trademarked characters). ' + prompt;
    res = await callGemini(url, sanitized);
    result = await extractGeminiImage(res);
    if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
      return { error: 'This prompt was blocked by content filters. Try rephrasing with original characters only.' };
    }
  }

  return result;
};

// --- Provider: OpenAI (GPT Image 1 Mini) ---

const OPENAI_MODELS = ['gpt-image-1-mini', 'gpt-image-1'];
const DEFAULT_OPENAI_MODEL = 'gpt-image-1-mini';

const generateWithOpenAI = async (prompt, modelId) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: 'OpenAI not configured' };

  const model = OPENAI_MODELS.includes(modelId) ? modelId : DEFAULT_OPENAI_MODEL;
  // Use 1024x1536 (portrait) for coloring book pages
  const size = '1024x1536';
  const quality = model === 'gpt-image-1' ? 'medium' : 'low';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model === 'gpt-image-1-mini' ? 'gpt-image-1' : model,
      prompt,
      n: 1,
      size,
      quality,
      output_format: 'png',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`OpenAI API error ${res.status}:`, errText);
    if (res.status === 429) return { error: 'Rate limit exceeded. Please wait a moment and try again.' };
    let detail = 'Image generation failed. Please try again.';
    try { const msg = JSON.parse(errText).error?.message; if (msg) detail = msg; } catch { /* use default */ }
    return { error: detail };
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error('OpenAI response had no image data:', JSON.stringify(data).slice(0, 1500));
    return { error: 'No image returned from generation service.' };
  }

  return { dataUrl: `data:image/png;base64,${b64}` };
};

// --- Model registry ---

// Cost in cents per image (approximate)
export const ALL_MODELS = [
  { id: 'gpt-image-1-mini', label: 'GPT Image Mini', desc: 'Fast & cheap (~$0.005)', provider: 'openai', costCents: 0.5 },
  { id: 'gpt-image-1', label: 'GPT Image 1', desc: 'Higher quality (~$0.015)', provider: 'openai', costCents: 1.5 },
  { id: 'gemini-2.5-flash-image', label: 'Gemini Flash', desc: 'Google (~$0.07)', provider: 'gemini', costCents: 7.0 },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash', desc: 'Google preview (~$0.07)', provider: 'gemini', costCents: 7.0 },
];

const PROVIDER_MAP = {
  'gemini-2.5-flash-image': 'gemini',
  'gemini-3.1-flash-image-preview': 'gemini',
  'gemini-3-pro-image-preview': 'gemini',
  'gpt-image-1-mini': 'openai',
  'gpt-image-1': 'openai',
};

export const handleGenerateImage = async (ctx) => {
  const { body, origin, userId, userEmail } = ctx;
  const { prompt, modelId } = body;

  if (!prompt || typeof prompt !== 'string') {
    return json(400, { error: 'prompt is required' }, origin);
  }
  if (prompt.length > 5000) {
    return json(400, { error: 'prompt too long (max 5000 chars)' }, origin);
  }

  // Check if model is enabled by admin
  const enabledModels = (await getAdminSetting('enabled_models')) || ALL_MODELS.map(m => m.id);
  const resolvedModelId = enabledModels.includes(modelId) ? modelId : enabledModels[0];
  if (!resolvedModelId) {
    return json(400, { error: 'No image models are currently enabled' }, origin);
  }

  const provider = PROVIDER_MAP[resolvedModelId] || 'openai';
  const modelInfo = ALL_MODELS.find(m => m.id === resolvedModelId);
  console.log(`[generate-image] provider=${provider}, model=${resolvedModelId}, prompt length=${prompt.length}`);

  try {
    const result = provider === 'gemini'
      ? await generateWithGemini(prompt, resolvedModelId)
      : await generateWithOpenAI(prompt, resolvedModelId);

    if (result.error) {
      return json(502, { error: result.error }, origin);
    }

    // Log cost (even if image is later deleted)
    try {
      await logGeneration(userId, resolvedModelId, modelInfo?.costCents || 0, userEmail);
    } catch (e) {
      console.error('Failed to log generation cost:', e.message);
    }

    return json(200, { dataUrl: result.dataUrl }, origin);
  } catch (err) {
    console.error('Image generation error:', err);
    return json(500, { error: 'Image generation failed unexpectedly' }, origin);
  }
};
