import { createClient } from '@libsql/client';

let client;
let initialized = false;

export const getDb = () => {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
};

export const ensureSchema = async () => {
  if (initialized) return;
  const db = getDb();
  // Split on semicolons and run each statement (libSQL doesn't support multi-statement exec)
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of statements) {
    await db.execute(sql);
  }
  // Migrations
  const migrations = [
    "ALTER TABLE pages ADD COLUMN caption TEXT DEFAULT ''",
    "ALTER TABLE pages ADD COLUMN notes TEXT DEFAULT ''",
    "ALTER TABLE books ADD COLUMN notes TEXT DEFAULT ''",
    "ALTER TABLE generation_log ADD COLUMN user_email TEXT DEFAULT ''",
    "ALTER TABLE pages ADD COLUMN character_desc TEXT DEFAULT ''",
    "ALTER TABLE pages ADD COLUMN text_in_image INTEGER DEFAULT 0",
    "ALTER TABLE pages ADD COLUMN title_in TEXT DEFAULT 'pdf'",
    "ALTER TABLE pages ADD COLUMN caption_in TEXT DEFAULT 'pdf'",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }
  initialized = true;
};

// ---------- Schema ----------

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  concept TEXT DEFAULT '',
  tagLine TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  scene TEXT DEFAULT '',
  prompt TEXT DEFAULT '',
  character_style TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pages_book_id ON pages(book_id);

CREATE TABLE IF NOT EXISTS image_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attempts_page_id ON image_attempts(page_id);

CREATE TABLE IF NOT EXISTS cover_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cover_attempts_book_id ON cover_attempts(book_id);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY,
  value TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS generation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_email TEXT DEFAULT '',
  model_id TEXT NOT NULL,
  cost_cents REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generation_log_user ON generation_log(user_id);
`;

// ---------- Books ----------

export const listBooks = async (userId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT b.*, (
      SELECT COUNT(1) FROM pages p WHERE p.book_id = b.id
    ) AS pageCount
    FROM books b
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC`,
    args: [userId],
  });
  return rows;
};

export const getBookWithPages = async (id, userId) => {
  const db = getDb();
  const { rows: bookRows } = await db.execute({
    sql: 'SELECT * FROM books WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  const book = bookRows[0];
  if (!book) return null;
  const { rows: pages } = await db.execute({
    sql: 'SELECT * FROM pages WHERE book_id = ? ORDER BY sort_order ASC, id ASC',
    args: [id],
  });
  return { ...book, pages };
};

export const insertBook = async (userId, { title, concept = '', tagLine = '' }) => {
  const db = getDb();
  const { lastInsertRowid } = await db.execute({
    sql: 'INSERT INTO books (user_id, title, concept, tagLine, cover_url) VALUES (?, ?, ?, ?, ?)',
    args: [userId, title, concept, tagLine, ''],
  });
  return getBookWithPages(lastInsertRowid, userId);
};

export const insertPages = async (bookId, pages = []) => {
  if (!pages.length) return [];
  const db = getDb();
  const ids = [];
  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const { lastInsertRowid } = await db.execute({
      sql: 'INSERT INTO pages (book_id, title, scene, prompt, character_style, image_url, sort_order, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        bookId,
        page.title ?? '',
        page.scene ?? '',
        page.prompt ?? '',
        page.characterStyle ?? page.character_style ?? '',
        page.imageUrl ?? '',
        page.sort_order ?? page.sortOrder ?? idx,
        page.caption ?? '',
      ],
    });
    ids.push(lastInsertRowid);
  }
  const placeholders = ids.map(() => '?').join(',');
  const { rows } = await db.execute({
    sql: `SELECT * FROM pages WHERE id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
    args: ids,
  });
  return rows;
};

// ---------- Image Attempts ----------

export const listImageAttempts = async (pageId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM image_attempts WHERE page_id = ? ORDER BY attempt_number DESC, created_at DESC',
    args: [pageId],
  });
  return rows;
};

export const nextAttemptNumber = async (pageId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT MAX(attempt_number) as maxNum FROM image_attempts WHERE page_id = ?',
    args: [pageId],
  });
  return (Number(rows[0]?.maxNum) || 0) + 1;
};

export const insertImageAttempt = async (pageId, url) => {
  const db = getDb();
  const attemptNumber = await nextAttemptNumber(pageId);
  const { lastInsertRowid } = await db.execute({
    sql: 'INSERT INTO image_attempts (page_id, url, attempt_number, approved) VALUES (?, ?, ?, 0)',
    args: [pageId, url, attemptNumber],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM image_attempts WHERE id = ?',
    args: [lastInsertRowid],
  });
  return rows[0];
};

export const getImageAttempt = async (id) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM image_attempts WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updateImageApproval = async (id, approved) => {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE image_attempts SET approved = ? WHERE id = ?',
    args: [approved ? 1 : 0, id],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM image_attempts WHERE id = ?',
    args: [id],
  });
  return rows[0];
};

export const deleteImageAttempt = async (id) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM image_attempts WHERE id = ?', args: [id] });
};

// ---------- Cover Attempts ----------

export const listCoverAttempts = async (bookId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM cover_attempts WHERE book_id = ? ORDER BY attempt_number DESC, created_at DESC',
    args: [bookId],
  });
  return rows;
};

export const nextCoverAttemptNumber = async (bookId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT MAX(attempt_number) as maxNum FROM cover_attempts WHERE book_id = ?',
    args: [bookId],
  });
  return (Number(rows[0]?.maxNum) || 0) + 1;
};

export const insertCoverAttempt = async (bookId, url) => {
  const db = getDb();
  const attemptNumber = await nextCoverAttemptNumber(bookId);
  const { lastInsertRowid } = await db.execute({
    sql: 'INSERT INTO cover_attempts (book_id, url, attempt_number, approved) VALUES (?, ?, ?, 0)',
    args: [bookId, url, attemptNumber],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM cover_attempts WHERE id = ?',
    args: [lastInsertRowid],
  });
  return rows[0];
};

export const getCoverAttempt = async (id) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM cover_attempts WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updateCoverApproval = async (id, approved) => {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE cover_attempts SET approved = ? WHERE id = ?',
    args: [approved ? 1 : 0, id],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM cover_attempts WHERE id = ?',
    args: [id],
  });
  return rows[0];
};

export const deleteCoverAttempt = async (id) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM cover_attempts WHERE id = ?', args: [id] });
};

// ---------- Cleanup (non-approved attempts) ----------

export const listUnapprovedImageAttempts = async (bookId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT ia.* FROM image_attempts ia
      JOIN pages p ON ia.page_id = p.id
      WHERE p.book_id = ? AND ia.approved = 0`,
    args: [bookId],
  });
  return rows;
};

export const listUnapprovedCoverAttempts = async (bookId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM cover_attempts WHERE book_id = ? AND approved = 0',
    args: [bookId],
  });
  return rows;
};

export const deleteUnapprovedAttempts = async (bookId) => {
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM image_attempts WHERE approved = 0 AND page_id IN (
      SELECT id FROM pages WHERE book_id = ?
    )`,
    args: [bookId],
  });
  await db.execute({
    sql: 'DELETE FROM cover_attempts WHERE book_id = ? AND approved = 0',
    args: [bookId],
  });
};

// ---------- Pages ----------

export const getPage = async (id) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM pages WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updatePage = async (id, { title, scene, prompt, characterStyle, characterDesc, imageUrl, sortOrder, caption, notes, textInImage, titleIn, captionIn }) => {
  const db = getDb();
  await db.execute({
    sql: `UPDATE pages SET
      title = COALESCE(?, title),
      scene = COALESCE(?, scene),
      prompt = COALESCE(?, prompt),
      character_style = COALESCE(?, character_style),
      character_desc = COALESCE(?, character_desc),
      image_url = COALESCE(?, image_url),
      sort_order = COALESCE(?, sort_order),
      caption = COALESCE(?, caption),
      notes = COALESCE(?, notes),
      text_in_image = COALESCE(?, text_in_image),
      title_in = COALESCE(?, title_in),
      caption_in = COALESCE(?, caption_in)
    WHERE id = ?`,
    args: [title ?? null, scene ?? null, prompt ?? null, characterStyle ?? null, characterDesc ?? null, imageUrl ?? null, sortOrder ?? null, caption ?? null, notes ?? null, textInImage ?? null, titleIn ?? null, captionIn ?? null, id],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM pages WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updateBook = async (id, { notes }) => {
  const db = getDb();
  await db.execute({
    sql: `UPDATE books SET notes = COALESCE(?, notes) WHERE id = ?`,
    args: [notes ?? null, id],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM books WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updateBookCoverUrl = async (bookId, coverUrl) => {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE books SET cover_url = ? WHERE id = ?',
    args: [coverUrl || '', bookId],
  });
  const { rows } = await db.execute({
    sql: 'SELECT * FROM books WHERE id = ?',
    args: [bookId],
  });
  return rows[0];
};

export const deleteBook = async (id) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM books WHERE id = ?', args: [id] });
};

export const deletePage = async (id) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM pages WHERE id = ?', args: [id] });
};

// ---------- Ownership check ----------

// ---------- Admin Settings (global, not per-user) ----------

export const getAdminSetting = async (key) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT value FROM admin_settings WHERE key = ?',
    args: [key],
  });
  if (!rows[0]) return null;
  try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
};

export const setAdminSetting = async (key, value) => {
  const db = getDb();
  const json = JSON.stringify(value);
  await db.execute({
    sql: `INSERT INTO admin_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, json],
  });
};

// ---------- Admin role (first user becomes admin) ----------

export const isAdmin = async (userId) => {
  const adminUserId = await getAdminSetting('admin_user_id');
  return adminUserId === userId;
};

export const ensureAdmin = async (userId) => {
  const existing = await getAdminSetting('admin_user_id');
  if (!existing) {
    await setAdminSetting('admin_user_id', userId);
    return true; // this user just became admin
  }
  return existing === userId;
};

// ---------- Generation Log ----------

export const logGeneration = async (userId, modelId, costCents, userEmail = '') => {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO generation_log (user_id, user_email, model_id, cost_cents) VALUES (?, ?, ?, ?)',
    args: [userId, userEmail, modelId, costCents],
  });
};

export const getGenerationStats = async () => {
  const db = getDb();
  const { rows: totals } = await db.execute({
    sql: `SELECT model_id, COUNT(*) as count, SUM(cost_cents) as total_cents
      FROM generation_log GROUP BY model_id ORDER BY total_cents DESC`,
    args: [],
  });
  const { rows: overall } = await db.execute({
    sql: `SELECT COUNT(*) as count, SUM(cost_cents) as total_cents FROM generation_log`,
    args: [],
  });
  const { rows: byUser } = await db.execute({
    sql: `SELECT user_id,
      COALESCE(MAX(user_email), '') as email,
      COUNT(*) as count, SUM(cost_cents) as total_cents,
      MIN(created_at) as first_gen, MAX(created_at) as last_gen
      FROM generation_log GROUP BY user_id ORDER BY total_cents DESC`,
    args: [],
  });
  // Daily totals for the last 30 days
  const { rows: daily } = await db.execute({
    sql: `SELECT date(created_at) as day, COUNT(*) as count, SUM(cost_cents) as total_cents
      FROM generation_log
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY day ASC`,
    args: [],
  });
  // Per-user daily for the last 30 days
  const { rows: userDaily } = await db.execute({
    sql: `SELECT user_id, date(created_at) as day, model_id,
      COUNT(*) as count, SUM(cost_cents) as total_cents
      FROM generation_log
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY user_id, date(created_at), model_id
      ORDER BY day ASC`,
    args: [],
  });
  return { byModel: totals, overall: overall[0], byUser, daily, userDaily };
};

// ---------- Settings (per-user, kept for future use) ----------

export const getSettings = async (userId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM settings WHERE user_id = ?',
    args: [userId],
  });
  if (!rows[0]) return null;
  try { return { ...rows[0], value: JSON.parse(rows[0].value) }; } catch { return rows[0]; }
};

export const upsertSettings = async (userId, value) => {
  const db = getDb();
  const json = JSON.stringify(value);
  await db.execute({
    sql: `INSERT INTO settings (user_id, value) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET value = excluded.value`,
    args: [userId, json],
  });
  return getSettings(userId);
};

// ---------- Ownership check ----------

export const verifyBookOwnership = async (bookId, userId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT id FROM books WHERE id = ? AND user_id = ?',
    args: [bookId, userId],
  });
  return rows.length > 0;
};

export const getPageWithBookOwnership = async (pageId, userId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT p.* FROM pages p
      JOIN books b ON p.book_id = b.id
      WHERE p.id = ? AND b.user_id = ?`,
    args: [pageId, userId],
  });
  return rows[0] || null;
};
