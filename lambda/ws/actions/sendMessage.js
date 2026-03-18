import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { chatCompletionStream, parseSSEStream } from '../../lib/openrouter.js';

const ALLOWED_MODELS = [
  'google/gemini-2.0-flash-001',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4',
];
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

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
 * sendMessage action — streams chat responses via OpenRouter back through WebSocket.
 */
export const sendMessage = async (event, connectionId) => {
  const client = getApiClient(event);
  const body = JSON.parse(event.body || '{}');
  const { messages = [], systemContext, model } = body.data || body;

  if (!messages.length || messages.length > 100) {
    await postToConnection(client, connectionId, { type: 'error', content: 'Invalid messages array' });
    return { statusCode: 400, body: 'invalid messages' };
  }

  // Validate model against allowlist
  const safeModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;

  // Sanitize messages — truncate content to prevent abuse
  const sanitizedMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 10000),
  }));

  // Build messages array with system context
  const allMessages = [];
  if (systemContext) {
    allMessages.push({ role: 'system', content: String(systemContext).slice(0, 5000) });
  }
  allMessages.push(...sanitizedMessages);

  try {
    const stream = await chatCompletionStream(allMessages, { model: safeModel });

    for await (const chunk of parseSSEStream(stream)) {
      await postToConnection(client, connectionId, { type: 'delta', content: chunk });
    }

    await postToConnection(client, connectionId, { type: 'done' });
  } catch (err) {
    console.error('sendMessage error:', err);
    await postToConnection(client, connectionId, { type: 'error', content: 'Failed to generate response' });
  }

  return { statusCode: 200, body: 'OK' };
};
