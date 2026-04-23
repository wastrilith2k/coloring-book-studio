import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Use a throwaway DB and uploads dir so the dev DB is never touched.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cbs-server-test-'));
process.env.SQLITE_PATH = path.join(tmp, 'test.db');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');
process.env.AUTH_SECRET = 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaa';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'super-secret-pass';

let app;
let request;

beforeAll(async () => {
  const supertest = (await import('supertest')).default;
  const server = await import('../index.js');
  ({ app } = server.createApp());
  request = supertest(app);
});

describe('health + auth', () => {
  it('GET /health returns ok', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/books without auth returns 401', async () => {
    const res = await request.get('/api/books');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with bad password returns 401', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with good creds returns a JWT', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'super-secret-pass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('admin');
  });
});

describe('books CRUD with auth', () => {
  let token;

  beforeAll(async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'super-secret-pass' });
    token = res.body.token;
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('lists books (empty initially)', async () => {
    const res = await auth(request.get('/api/books'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.books)).toBe(true);
  });

  it('creates a book', async () => {
    const res = await auth(
      request
        .post('/api/books')
        .send({ title: 'Smoke Book', concept: 'dragons', tagLine: 'rawr', audience: 'kids' })
    );
    expect(res.status).toBe(201);
    expect(res.body.book.id).toBeTypeOf('number');
    expect(res.body.book.audience).toBe('kids');
  });

  it('updates book notes via PUT', async () => {
    const created = await auth(request.post('/api/books').send({ title: 'B' }));
    const id = created.body.book.id;
    const res = await auth(request.put(`/api/books/${id}`).send({ notes: 'hello notes' }));
    expect(res.status).toBe(200);
    expect(res.body.book.notes).toBe('hello notes');
  });

  it('rejects invalid JWT', async () => {
    const res = await request.get('/api/books').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});

describe('settings + admin', () => {
  let token;
  beforeAll(async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'super-secret-pass' });
    token = res.body.token;
  });

  it('GET /api/settings returns model list', async () => {
    const res = await request.get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body.models.length).toBeGreaterThan(0);
    expect(res.body.promptEvaluatorEnabled).toBe(true);
  });

  it('GET /api/admin/stats works for admin', async () => {
    const res = await request.get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.totals)).toBe(true);
  });

  it('PUT /api/admin/models filters to known models', async () => {
    const res = await request
      .put('/api/admin/models')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabledModels: ['flux-schnell', 'not-a-real-model'] });
    expect(res.status).toBe(200);
    expect(res.body.enabledModels).toEqual(['flux-schnell']);
  });
});

describe('generate-image input validation', () => {
  let token;
  beforeAll(async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'super-secret-pass' });
    token = res.body.token;
  });

  it('rejects missing prompt', async () => {
    const res = await request
      .post('/api/generate-image')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects oversized prompt', async () => {
    const res = await request
      .post('/api/generate-image')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'x'.repeat(6000) });
    expect(res.status).toBe(400);
  });
});
