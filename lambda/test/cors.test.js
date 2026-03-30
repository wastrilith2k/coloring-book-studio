import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('cors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const loadCors = async (allowedOrigins) => {
    if (allowedOrigins !== undefined) {
      process.env.ALLOWED_ORIGINS = allowedOrigins;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
    return import('../lib/cors.js');
  };

  describe('getCorsHeaders', () => {
    it('reflects an allowed origin', async () => {
      const { getCorsHeaders } = await loadCors('http://localhost:5173,https://app.example.com');
      const headers = getCorsHeaders('https://app.example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
      expect(headers['Vary']).toBe('Origin');
    });

    it('falls back to first allowed origin for unknown origins', async () => {
      const { getCorsHeaders } = await loadCors('http://localhost:5173,https://app.example.com');
      const headers = getCorsHeaders('https://evil.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    it('uses default localhost when ALLOWED_ORIGINS is not set', async () => {
      const { getCorsHeaders } = await loadCors(undefined);
      const headers = getCorsHeaders('https://anything.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });

  describe('json', () => {
    it('returns a JSON response with CORS headers', async () => {
      const { json } = await loadCors('http://localhost:5173');
      const res = json(200, { ok: true }, 'http://localhost:5173');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
      expect(res.headers['Content-Type']).toBe('application/json');
      expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    it('stringifies the body', async () => {
      const { json } = await loadCors('http://localhost:5173');
      const res = json(400, { error: 'bad' }, '');
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'bad' });
    });
  });

  describe('noContent', () => {
    it('returns 204 with empty body and CORS headers', async () => {
      const { noContent } = await loadCors('http://localhost:5173');
      const res = noContent('http://localhost:5173');
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });
});
