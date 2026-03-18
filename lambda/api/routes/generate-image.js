import { json } from '../../lib/cors.js';

const ALLOWED_MODELS = [
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-image-generation',
];
const DEFAULT_MODEL = 'gemini-2.5-flash-image-preview';

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });

    if (!res.ok) {
      // Log the actual error server-side, return generic message to client
      const errText = await res.text();
      console.error(`Gemini API error ${res.status}:`, errText);
      return json(502, { error: 'Image generation failed. Please try again.' }, origin);
    }

    const data = await res.json();
    const base64 = data.candidates?.[0]?.content?.parts?.find(
      p => p.inlineData
    )?.inlineData?.data;

    if (!base64) {
      return json(502, { error: 'No image returned from generation service' }, origin);
    }

    return json(200, { dataUrl: `data:image/png;base64,${base64}` }, origin);
  } catch (err) {
    console.error('Image generation error:', err);
    return json(500, { error: 'Image generation failed unexpectedly' }, origin);
  }
};
