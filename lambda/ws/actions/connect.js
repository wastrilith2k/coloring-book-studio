/**
 * $connect handler — validates the Cognito JWT.
 * The API Gateway Lambda authorizer handles JWT validation before this runs,
 * so if we reach here the connection is authorized.
 */
export const connect = async (event) => {
  const userId = event.requestContext?.authorizer?.sub;
  console.log(`WebSocket connected: ${event.requestContext.connectionId}, user: ${userId}`);
  return { statusCode: 200, body: 'Connected' };
};
