/**
 * Cognito (AWS) auth adapter. Wraps Amplify's Authenticator + fetchAuthSession.
 * Loaded only when VITE_AUTH_MODE=cognito (the default for AWS builds).
 */
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, signOut as amplifySignOut } from '@aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';
import amplifyConfig from '../../amplifyConfig.js';

Amplify.configure(amplifyConfig);

export const getIdToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return token;
};

export const signOut = async () => {
  try { await amplifySignOut(); } catch { /* ignore */ }
};

export const getUser = async () => {
  try {
    const session = await fetchAuthSession();
    const payload = session.tokens?.idToken?.payload;
    if (!payload) return null;
    return { email: payload.email, role: payload['cognito:groups']?.includes('admin') ? 'admin' : 'user' };
  } catch {
    return null;
  }
};

export const mountAuthUI = async (rootEl, renderApp) => {
  const root = createRoot(rootEl);
  root.render(
    createElement(
      StrictMode,
      null,
      createElement(
        Authenticator,
        null,
        ({ signOut, user }) => renderApp({ user, signOut })
      )
    )
  );
};
