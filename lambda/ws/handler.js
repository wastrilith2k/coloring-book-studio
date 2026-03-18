import { connect } from './actions/connect.js';
import { disconnect } from './actions/disconnect.js';
import { sendMessage } from './actions/sendMessage.js';
import { generateIdeas } from './actions/generateIdeas.js';

export const handler = async (event) => {
  const routeKey = event.requestContext?.routeKey;
  const connectionId = event.requestContext?.connectionId;

  try {
    switch (routeKey) {
      case '$connect':
        return await connect(event);
      case '$disconnect':
        return await disconnect(event);
      case 'sendMessage':
        return await sendMessage(event, connectionId);
      case 'generateIdeas':
        return await generateIdeas(event, connectionId);
      default:
        return { statusCode: 400, body: 'Unknown route' };
    }
  } catch (err) {
    console.error(`WebSocket error [${routeKey}]:`, err);
    return { statusCode: 500, body: err.message };
  }
};
