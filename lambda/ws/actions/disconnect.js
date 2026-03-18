/**
 * $disconnect handler — cleanup on WebSocket close.
 */
export const disconnect = async (event) => {
  console.log(`WebSocket disconnected: ${event.requestContext.connectionId}`);
  return { statusCode: 200, body: 'Disconnected' };
};
