import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { chatCompletionStream, parseSSEStream } from '../../lib/openrouter.js';

const getApiClient = (event) => {
  const { domainName, stage } = event.requestContext;
  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });
};

const postToConnection = async (client, connectionId, data) => {
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data)),
  }));
};

/**
 * generateIdeas action — streams structured JSON idea generation via OpenRouter.
 */
export const generateIdeas = async (event, connectionId) => {
  const client = getApiClient(event);
  const body = JSON.parse(event.body || '{}');
  const { theme = '', audience = 'kids', length = 8 } = body.data || body;

  // Validate and clamp inputs
  const sceneCount = Math.max(1, Math.min(50, Number(length) || 20));
  const safeTheme = String(theme).slice(0, 500);
  const safeAudience = String(audience).slice(0, 100);

  const systemPrompt = 'You are a coloring book planner. Propose a book concept and page scenes with concise prompts. Respond in JSON with keys: title, tagLine, concept, pages (array of {title, scene, prompt}). Keep prompts coloring-book friendly.';

  const messages = [
    { role: 'system', content: systemPrompt },
    safeTheme ? { role: 'user', content: `Theme: ${safeTheme}` } : null,
    { role: 'user', content: `Audience: ${safeAudience}. Scenes: ${sceneCount}.` },
  ].filter(Boolean);

  try {
    const stream = await chatCompletionStream(messages);
    let fullText = '';

    for await (const chunk of parseSSEStream(stream)) {
      fullText += chunk;
      await postToConnection(client, connectionId, { type: 'delta', content: chunk });
    }

    let parsed;
    try {
      const cleaned = fullText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: fullText };
    }

    await postToConnection(client, connectionId, { type: 'done', idea: parsed });
  } catch (err) {
    console.error('generateIdeas error:', err);
    await postToConnection(client, connectionId, { type: 'error', content: 'Failed to generate ideas' });
  }

  return { statusCode: 200, body: 'OK' };
};
