import { fetchAuthSession } from '@aws-amplify/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8788';
const WS_URL = import.meta.env.VITE_WS_URL || '';

/**
 * Get the current user's ID token for API authorization.
 */
export const getIdToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return token;
};

/**
 * Authenticated fetch wrapper that attaches the Cognito ID token.
 */
export const apiFetch = async (path, options = {}) => {
  const token = await getIdToken();
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res;
};

/**
 * WebSocket connection manager with reconnect logic.
 */
export class ChatWebSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = await getIdToken();
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handlers = this.listeners.get(data.type) || [];
          handlers.forEach(fn => fn(data));
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(err);
        }
      };
    });
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), delay);
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
    return () => {
      const handlers = this.listeners.get(type) || [];
      this.listeners.set(type, handlers.filter(h => h !== handler));
    };
  }

  send(action, data) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify({ action, data }));
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.maxReconnectAttempts = 0; // prevent reconnect
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton WebSocket instance
export const chatWs = new ChatWebSocket();
