import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

const SSM_PREFIX = '/coloring-book-studio/';
let loaded = false;

/**
 * Load secrets from SSM Parameter Store into process.env.
 * Only fetches once per cold start. Existing env vars take precedence
 * (so local dev with .env still works).
 */
export const loadSecrets = async () => {
  if (loaded) return;
  const ssm = new SSMClient();
  try {
    const { Parameters = [] } = await ssm.send(new GetParametersByPathCommand({
      Path: SSM_PREFIX,
      WithDecryption: true,
    }));
    for (const param of Parameters) {
      const key = param.Name.replace(SSM_PREFIX, '');
      if (!process.env[key]) {
        process.env[key] = param.Value;
      }
    }
  } catch (err) {
    console.error('Failed to load secrets from SSM:', err.message);
    // Don't throw — fall back to env vars (may already be set)
  }
  loaded = true;
};
