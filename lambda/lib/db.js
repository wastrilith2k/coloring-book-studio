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
      sql: 'INSERT INTO pages (book_id, title, scene, prompt, character_style, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        bookId,
        page.title ?? '',
        page.scene ?? '',
        page.prompt ?? '',
        page.characterStyle ?? page.character_style ?? '',
        page.imageUrl ?? '',
        page.sort_order ?? page.sortOrder ?? idx,
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

// ---------- Pages ----------

export const getPage = async (id) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM pages WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
};

export const updatePage = async (id, { title, scene, prompt, characterStyle, imageUrl, sortOrder, caption, notes }) => {
  const db = getDb();
  await db.execute({
    sql: `UPDATE pages SET
      title = COALESCE(?, title),
      scene = COALESCE(?, scene),
      prompt = COALESCE(?, prompt),
      character_style = COALESCE(?, character_style),
      image_url = COALESCE(?, image_url),
      sort_order = COALESCE(?, sort_order),
      caption = COALESCE(?, caption),
      notes = COALESCE(?, notes)
    WHERE id = ?`,
    args: [title ?? null, scene ?? null, prompt ?? null, characterStyle ?? null, imageUrl ?? null, sortOrder ?? null, caption ?? null, notes ?? null, id],
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
