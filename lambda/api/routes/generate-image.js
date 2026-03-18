import { json } from '../../lib/cors.js';

const ALLOWED_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

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

  // Validate model ID against allowlist to prevent URL injection
  const model = ALLOWED_MODELS.includes(modelId) ? modelId : DEFAULT_MODEL;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: 'Image generation not configured' }, origin);

  try {
    console.log(`[generate-image] model=${model}, prompt length=${prompt.length}, prompt preview="${prompt.slice(0, 120)}..."`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });

    console.log(`[generate-image] Gemini responded with status ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gemini API error ${res.status}:`, errText);

      // Surface quota/rate-limit errors to the user
      if (res.status === 429) {
        return json(429, { error: 'Rate limit exceeded. Please wait a moment and try again.' }, origin);
      }
      if (res.status === 403) {
        return json(403, { error: 'API quota exceeded or access denied. Check your Gemini API key and billing.' }, origin);
      }

      // Try to parse a useful message from the Gemini error
      let detail = 'Image generation failed. Please try again.';
      try {
        const errJson = JSON.parse(errText);
        const msg = errJson.error?.message;
        if (msg) detail = msg;
      } catch { /* use default */ }

      return json(502, { error: detail }, origin);
    }

    const data = await res.json();

    // Check for blocked content (safety filters)
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKED') {
      return json(400, { error: 'Image blocked by safety filters. Try a different prompt.' }, origin);
    }

    // Gemini REST API uses snake_case (inline_data), but some SDK wrappers
    // return camelCase (inlineData). Check both to be safe.
    const imagePart = candidate?.content?.parts?.find(
      p => p.inline_data || p.inlineData
    );
    const inlineData = imagePart?.inline_data || imagePart?.inlineData;

    if (!inlineData?.data) {
      const debugInfo = JSON.stringify(data).slice(0, 1500);
      console.error('Gemini response had no image data. Full response:', debugInfo);
      return json(502, { error: `No image in response. Debug: ${debugInfo}` }, origin);
    }

    const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
    return json(200, { dataUrl: `data:${mimeType};base64,${inlineData.data}` }, origin);
  } catch (err) {
    console.error('Image generation error:', err);
    return json(500, { error: 'Image generation failed unexpectedly' }, origin);
  }
};
