const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const getApiKey = () => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('Missing OPENROUTER_API_KEY');
  return key;
};

/**
 * Non-streaming chat completion via OpenRouter.
 */
export const chatCompletion = async (messages, { model = 'google/gemini-2.0-flash-001', temperature = 0.6, maxTokens = 1200 } = {}) => {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': 'https://coloring-book-studio.app',
      'X-Title': 'Coloring Book Studio',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
};

/**
 * Streaming chat completion via OpenRouter.
 * Returns a ReadableStream of SSE chunks.
 */
export const chatCompletionStream = async (messages, { model = 'google/gemini-2.0-flash-001', temperature = 0.6, maxTokens = 1200 } = {}) => {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': 'https://coloring-book-studio.app',
      'X-Title': 'Coloring Book Studio',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }
  return res.body;
};

/**
 * Parse SSE stream and yield text deltas.
 */
export async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.replace(/^data:\s*/, '');
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore parse errors
      }
    }
  }
}
