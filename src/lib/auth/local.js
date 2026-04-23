/**
 * Local (self-hosted) auth adapter. Single-admin login against
 * the Express server's /api/auth/login endpoint. JWT is stored
 * in localStorage and sent as a Bearer token by api.js.
 */
import { StrictMode, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const TOKEN_KEY = 'cbs.local.token';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8788';

const decodeJwt = (token) => {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const isExpired = (payload) => {
  if (!payload?.exp) return true;
  return Date.now() / 1000 >= payload.exp;
};

export const getIdToken = async () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Not authenticated');
  const payload = decodeJwt(token);
  if (!payload || isExpired(payload)) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Session expired');
  }
  return token;
};

export const signOut = async () => {
  localStorage.removeItem(TOKEN_KEY);
  window.location.reload();
};

export const getUser = async () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || isExpired(payload)) return null;
  return { email: payload.email, role: payload.role };
};

const LoginForm = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Login failed (${res.status})`);
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f0f12', color: '#eee', fontFamily: 'system-ui, sans-serif' } },
    createElement(
      'form',
      { onSubmit: submit, style: { width: 320, padding: 32, background: '#1a1a1f', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' } },
      createElement('h1', { style: { margin: '0 0 24px', fontSize: 22, textAlign: 'center' } }, 'Coloring Book Studio'),
      createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: '#aaa' } }, 'Email'),
      createElement('input', {
        type: 'email', required: true, value: email, autoFocus: true,
        onChange: e => setEmail(e.target.value),
        style: { width: '100%', padding: 10, marginBottom: 16, borderRadius: 6, border: '1px solid #333', background: '#0f0f12', color: '#eee', boxSizing: 'border-box' },
      }),
      createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: '#aaa' } }, 'Password'),
      createElement('input', {
        type: 'password', required: true, value: password,
        onChange: e => setPassword(e.target.value),
        style: { width: '100%', padding: 10, marginBottom: 16, borderRadius: 6, border: '1px solid #333', background: '#0f0f12', color: '#eee', boxSizing: 'border-box' },
      }),
      error && createElement('div', { style: { color: '#ff6b6b', fontSize: 13, marginBottom: 12 } }, error),
      createElement('button', {
        type: 'submit', disabled: busy,
        style: { width: '100%', padding: 12, borderRadius: 6, border: 'none', background: busy ? '#444' : '#5a87ff', color: '#fff', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' },
      }, busy ? 'Signing in…' : 'Sign in')
    )
  );
};

const AuthGate = ({ renderApp }) => {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getUser().then(u => { setUser(u); setReady(true); });
  }, []);

  if (!ready) return null;
  if (!user) return createElement(LoginForm, { onSuccess: setUser });

  return renderApp({ user, signOut });
};

export const mountAuthUI = async (rootEl, renderApp) => {
  const root = createRoot(rootEl);
  root.render(
    createElement(StrictMode, null, createElement(AuthGate, { renderApp }))
  );
};
