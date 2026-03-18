import { CognitoJwtVerifier } from 'aws-jwt-verify';

let verifier;

const getVerifier = () => {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID,
      tokenUse: 'id',
      clientId: process.env.USER_POOL_CLIENT_ID,
    });
  }
  return verifier;
};

/**
 * Lambda authorizer for WebSocket $connect.
 * Validates the Cognito JWT passed as query string parameter.
 */
export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return { isAuthorized: false };
    }

    const payload = await getVerifier().verify(token);

    return {
      isAuthorized: true,
      context: {
        sub: payload.sub,
        email: payload.email || '',
      },
    };
  } catch (err) {
    console.error('WebSocket auth failed:', err.message);
    return { isAuthorized: false };
  }
};
