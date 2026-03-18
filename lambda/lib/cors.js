const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

/**
 * Build CORS headers with origin validation.
 * Only reflects the request origin if it's in the allowed list.
 */
export const getCorsHeaders = (requestOrigin) => {
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Vary': 'Origin',
  };
};

export const json = (statusCode, body, requestOrigin) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...getCorsHeaders(requestOrigin) },
  body: JSON.stringify(body),
});

export const noContent = (requestOrigin) => ({
  statusCode: 204,
  headers: getCorsHeaders(requestOrigin),
  body: '',
});
