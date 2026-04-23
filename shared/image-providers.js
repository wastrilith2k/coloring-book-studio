// Pure provider functions for image generation. No transport, no DB, no auth.
// Inputs: prompt + modelId. Outputs: { dataUrl } | { error } | { error: null, finishReason }.

const GEMINI_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-image';

const BLOCKED_REASONS = new Set(['PROHIBITED_CONTENT', 'SAFETY', 'BLOCKED']);

const callGemini = (url, prompt) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

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

export const generateWithGemini = async (prompt, modelId) => {
  const model = GEMINI_MODELS.includes(modelId) ? modelId : DEFAULT_GEMINI_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: 'Gemini not configured' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const geminiPrompt = prompt + '\n\nIMPORTANT: Generate the image in 3:4 portrait aspect ratio (taller than wide), suitable for an 8.5x11 inch page.';

  let res = await callGemini(url, geminiPrompt);
  let result = await extractGeminiImage(res);

  if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
    console.log(`[image-providers] Blocked (${result.finishReason}), retrying sanitized`);
    const sanitized = 'Create an original illustration (no copyrighted or trademarked characters). ' + prompt;
    res = await callGemini(url, sanitized);
    result = await extractGeminiImage(res);
    if (result.finishReason && BLOCKED_REASONS.has(result.finishReason)) {
      return { error: 'This prompt was blocked by content filters. Try rephrasing with original characters only.' };
    }
  }

  return result;
};

const OPENAI_MODELS = ['gpt-image-1-mini', 'gpt-image-1'];
const DEFAULT_OPENAI_MODEL = 'gpt-image-1-mini';

export const generateWithOpenAI = async (prompt, modelId) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: 'OpenAI not configured' };

  const model = OPENAI_MODELS.includes(modelId) ? modelId : DEFAULT_OPENAI_MODEL;
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

export const generateWithFal = async (prompt, modelId) => {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return { error: 'fal.ai not configured' };

  const modelMap = {
    'flux-schnell': 'fal-ai/flux/schnell',
    'flux-dev': 'fal-ai/flux/dev',
  };
  const falModel = modelMap[modelId] || modelMap['flux-schnell'];

  const res = await fetch(`https://fal.run/${falModel}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: 768, height: 1024 },
      num_images: 1,
      enable_safety_checker: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`fal.ai API error ${res.status}:`, errText);
    if (res.status === 429) return { error: 'Rate limit exceeded. Please wait a moment and try again.' };
    let detail = 'Image generation failed. Please try again.';
    try {
      const parsed = JSON.parse(errText);
      const msg = parsed.detail || parsed.message;
      if (msg) detail = typeof msg === 'string' ? msg : JSON.stringify(msg);
    } catch { /* use default */ }
    return { error: detail };
  }

  const data = await res.json();
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) {
    console.error('fal.ai response had no image:', JSON.stringify(data).slice(0, 1500));
    return { error: 'No image returned from generation service.' };
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return { error: 'Failed to download generated image.' };
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
};

export const ALL_MODELS = [
  { id: 'flux-schnell', label: 'Flux Schnell', desc: 'Fast & cheapest (~$0.003)', provider: 'fal', costCents: 0.3 },
  { id: 'flux-dev', label: 'Flux Dev', desc: 'Higher quality (~$0.025)', provider: 'fal', costCents: 2.5 },
  { id: 'gpt-image-1-mini', label: 'GPT Image Mini', desc: 'Fast & cheap (~$0.005)', provider: 'openai', costCents: 0.5 },
  { id: 'gpt-image-1', label: 'GPT Image 1', desc: 'Higher quality (~$0.015)', provider: 'openai', costCents: 1.5 },
  { id: 'gemini-2.5-flash-image', label: 'Gemini Flash', desc: 'Google (~$0.07)', provider: 'gemini', costCents: 7.0 },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash', desc: 'Google preview (~$0.07)', provider: 'gemini', costCents: 7.0 },
];

export const PROVIDER_MAP = {
  'flux-schnell': 'fal',
  'flux-dev': 'fal',
  'gemini-2.5-flash-image': 'gemini',
  'gemini-3.1-flash-image-preview': 'gemini',
  'gemini-3-pro-image-preview': 'gemini',
  'gpt-image-1-mini': 'openai',
  'gpt-image-1': 'openai',
};

export const generators = {
  gemini: generateWithGemini,
  openai: generateWithOpenAI,
  fal: generateWithFal,
};

export const generateImage = async (prompt, modelId) => {
  const provider = PROVIDER_MAP[modelId] || 'openai';
  const generate = generators[provider] || generateWithOpenAI;
  return generate(prompt, modelId);
};
