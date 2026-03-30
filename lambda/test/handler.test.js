import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies with correct paths (relative to THIS test file)
vi.mock('../lib/secrets.js', () => ({
  loadSecrets: vi.fn(),
}));

// Mock db.js with ALL exports the route handlers need
vi.mock('../lib/db.js', () => ({
  ensureSchema: vi.fn(),
  ensureAdmin: vi.fn(),
  isAdmin: vi.fn().mockResolvedValue(false),
  getAdminSetting: vi.fn().mockResolvedValue(null),
  setAdminSetting: vi.fn(),
  getGenerationStats: vi.fn().mockResolvedValue({ byModel: [], overall: {}, byUser: [] }),
  getDb: vi.fn(),
  listBooks: vi.fn().mockResolvedValue([]),
  getBookWithPages: vi.fn().mockResolvedValue(null),
  insertBook: vi.fn().mockResolvedValue({ id: 1, pages: [] }),
  insertPages: vi.fn().mockResolvedValue([]),
  deleteBook: vi.fn(),
  updateBook: vi.fn(),
  verifyBookOwnership: vi.fn().mockResolvedValue(true),
  listCoverAttempts: vi.fn().mockResolvedValue([]),
  insertCoverAttempt: vi.fn(),
  getCoverAttempt: vi.fn(),
  updateCoverApproval: vi.fn(),
  deleteCoverAttempt: vi.fn(),
  updateBookCoverUrl: vi.fn(),
  nextCoverAttemptNumber: vi.fn().mockResolvedValue(1),
  listUnapprovedImageAttempts: vi.fn().mockResolvedValue([]),
  listUnapprovedCoverAttempts: vi.fn().mockResolvedValue([]),
  deleteUnapprovedAttempts: vi.fn(),
  getPageWithBookOwnership: vi.fn().mockResolvedValue({ id: 1, book_id: 1 }),
  updatePage: vi.fn().mockResolvedValue({ id: 1 }),
  deletePage: vi.fn(),
  listImageAttempts: vi.fn().mockResolvedValue([]),
  insertImageAttempt: vi.fn(),
  getImageAttempt: vi.fn(),
  updateImageApproval: vi.fn(),
  deleteImageAttempt: vi.fn(),
  nextAttemptNumber: vi.fn().mockResolvedValue(1),
  logGeneration: vi.fn(),
  getSettings: vi.fn(),
  upsertSettings: vi.fn(),
  getPage: vi.fn(),
}));

vi.mock('../lib/s3.js', () => ({
  uploadToS3: vi.fn(),
  getPresignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
  getObjectBuffer: vi.fn(),
  deleteFromS3: vi.fn(),
  buildImageKey: vi.fn().mockReturnValue('users/u/books/1/pages/1/attempt-1.png'),
  buildCoverKey: vi.fn().mockReturnValue('users/u/books/1/cover/attempt-1.png'),
  objectExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../lib/image.js', () => ({
  printKey: vi.fn(k => k.replace('.png', '-print.png')),
  upscaleForPrint: vi.fn().mockResolvedValue(Buffer.from('fake')),
}));

vi.mock('../lib/openrouter.js', () => ({
  chatCompletion: vi.fn().mockResolvedValue('AI response'),
}));

const makeEvent = (method, path, { body, claims } = {}) => ({
  requestContext: {
    http: { method },
    authorizer: { jwt: { claims: { sub: 'test-user', email: 'test@example.com', ...claims } } },
  },
  rawPath: path,
  headers: { origin: 'http://localhost:5173' },
  body: body ? JSON.stringify(body) : undefined,
  isBase64Encoded: false,
});

describe('API handler', () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../api/handler.js');
    handler = mod.handler;
  });

  it('handles CORS preflight', async () => {
    const event = {
      requestContext: { http: { method: 'OPTIONS' } },
      headers: { origin: 'http://localhost:5173' },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('returns 200 for GET /health', async () => {
    const res = await handler(makeEvent('GET', '/health'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('routes /api/books to books handler', async () => {
    const res = await handler(makeEvent('GET', '/api/books'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('books');
  });

  it('routes /api/pages/:id to pages handler', async () => {
    const res = await handler(makeEvent('PUT', '/api/pages/1', { body: { title: 'Test' } }));
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await handler(makeEvent('GET', '/api/unknown'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
  });

  it('returns 401 when user identity is missing', async () => {
    const event = {
      requestContext: { http: { method: 'GET' }, authorizer: {} },
      rawPath: '/health',
      headers: { origin: '' },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it('validates chat messages — rejects empty array', async () => {
    const res = await handler(makeEvent('POST', '/api/chat', { body: { messages: [] } }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid messages');
  });

  it('returns settings with admin status', async () => {
    const res = await handler(makeEvent('GET', '/api/settings'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('isAdmin');
    expect(body).toHaveProperty('enabledModels');
  });

  it('blocks non-admin from PUT /api/admin/models', async () => {
    const res = await handler(makeEvent('PUT', '/api/admin/models', {
      body: { enabledModels: ['test-model'] },
    }));
    expect(res.statusCode).toBe(403);
  });

  it('blocks non-admin from GET /api/admin/stats', async () => {
    const res = await handler(makeEvent('GET', '/api/admin/stats'));
    expect(res.statusCode).toBe(403);
  });
});
