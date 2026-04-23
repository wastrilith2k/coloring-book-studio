/**
 * Pluggable auth adapter. The active adapter is chosen at build time via
 * `VITE_AUTH_MODE` (`cognito` | `local`). The conditional below is written
 * with literal env reads so Vite tree-shakes the unused adapter chunk —
 * a `local` build will not contain Amplify, and vice versa.
 *
 * Adapter contract:
 *   - getIdToken(): Promise<string>           // throws if not signed in
 *   - signOut(): Promise<void>
 *   - getUser(): Promise<{ email, role? } | null>
 *   - mountAuthUI(rootEl, renderApp): Promise<void>
 */

let adapterPromise;
const loadAdapter = () => {
  if (adapterPromise) return adapterPromise;
  if (import.meta.env.VITE_AUTH_MODE === 'local') {
    adapterPromise = import('./local.js');
  } else {
    adapterPromise = import('./cognito.js');
  }
  return adapterPromise;
};

export const authMode = import.meta.env.VITE_AUTH_MODE === 'local' ? 'local' : 'cognito';

export const getIdToken = async () => (await loadAdapter()).getIdToken();
export const signOut = async () => (await loadAdapter()).signOut();
export const getUser = async () => (await loadAdapter()).getUser();
export const mountAuthUI = async (rootEl, renderApp) =>
  (await loadAdapter()).mountAuthUI(rootEl, renderApp);
