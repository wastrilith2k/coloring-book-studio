/**
 * Extract user ID from Cognito JWT claims provided by API Gateway authorizer.
 * API Gateway HTTP API JWT authorizer puts claims in event.requestContext.authorizer.jwt.claims.
 */
export const getUserId = (event) => {
  // HTTP API with JWT authorizer
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (claims?.sub) return claims.sub;

  // Lambda authorizer (WebSocket or custom)
  const authContext = event.requestContext?.authorizer;
  if (authContext?.sub) return authContext.sub;

  throw new Error('Unauthorized: no user identity found');
};

/**
 * Extract user ID from WebSocket $connect event.
 * JWT is passed as query string parameter since WebSocket doesn't support Authorization header on connect.
 */
export const getUserIdFromWs = (event) => {
  const authContext = event.requestContext?.authorizer;
  if (authContext?.sub) return authContext.sub;
  throw new Error('Unauthorized');
};
