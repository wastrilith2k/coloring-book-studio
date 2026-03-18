import { json } from '../../lib/cors.js';

const ALLOWED_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

const BLOCKED_REASONS = new Set(['PROHIBITED_CONTENT', 'SAFETY', 'BLOCKED']);

/**
 * Call the Gemini generateContent API and return the parsed response.
 */
const callGemini = async (url, prompt) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  return res;
};

/**
 * Extract image data from a Gemini response body.
 * Returns { dataUrl } on success, or { error, finishReason } on failure.
 */
const extractImage = async (res) => {
  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gemini API error ${res.status}:`, errText);

    if (res.status === 429) return { error: 'Rate limit exceeded. Please wait a moment and try again.' };
    if (res.status === 403) return { error: 'API quota exceeded or access denied. Check your Gemini API key and billing.' };

    let detail = 'Image generation failed. Please try again.';
    try {
      const msg = JSON.parse(errText).error?.message;
      if (msg) detail = msg;
    } catch { /* use default */ }

    return { error: detail };
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (BLOCKED_REASONS.has(finishReason)) {
    return { error: null, finishReason };
  }

  // Gemini REST API uses snake_case; some SDK wrappers use camelCase.
  const imagePart = candidate?.content?.parts?.find(
    p => p.inline_data || p.inlineData
  );
  const inlineData = imagePart?.inline_data || imagePart?.inlineData;

  if (!inlineData?.data) {
    console.error('Gemini response had no image data:', JSON.stringify(data).slice(0, 1500));
    return { error: 'No image returned from generation service.' };
  }

  const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
  return { dataUrl: `data:${mimeType};base64,${inlineData.data}` };
};

/**
 * Server-side proxy for Gemini image generation.
 * Keeps the GEMINI_API_KEY on the server instead of exposing it to the frontend.
 */
export const handleGenerateImage = async (ctx) => {
  const { body, origin } = ctx;
  const { prompt, modelId } = body;

  if (!prompt || typeof prompt !== 'string') {
    return json(400, { error: 'prompt is required' }, origin);
  }

  if (prompt.length > 5000) {
    return json(400, { error: 'prompt too long (max 5000 chars)' }, origin);
  }

  const model = ALLOWED_MODELS.includes(modelId) ? modelId : DEFAULT_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: 'Image generation not configured' }, origin);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    console.log(`[generate-image] model=${model}, prompt length=${prompt.length}`);

    // First attempt with original prompt
    let res = await callGemini(url, prompt);
    let result = await extractImage(res);

    // If blocked for copyright/safety, retry with a sanitized prompt
    if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
      console.log(`[generate-image] Blocked (${result.finishReason}), retrying with sanitized prompt`);
      const sanitized =
        'Create an original illustration (no copyrighted or trademarked characters). ' +
        prompt;
      res = await callGemini(url, sanitized);
      result = await extractImage(res);

      // Still blocked after retry
      if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
        return json(400, {
          error: 'This prompt was blocked by content filters (possibly copyrighted characters). Try rephrasing with original characters only.',
        }, origin);
      }
    }

    if (result.error) {
      return json(502, { error: result.error }, origin);
    }

    return json(200, { dataUrl: result.dataUrl }, origin);
  } catch (err) {
    console.error('Image generation error:', err);
    return json(500, { error: 'Image generation failed unexpectedly' }, origin);
  }
};
