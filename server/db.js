import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.join(__dirname, 'data.db');
const dbPath = process.env.SQLITE_PATH || defaultPath;

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);

function init() {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      concept TEXT DEFAULT '',
      tagLine TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      audience TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      title TEXT DEFAULT '',
      scene TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      character_style TEXT DEFAULT '',
      character_desc TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      caption TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      text_in_image INTEGER DEFAULT 0,
      title_in TEXT DEFAULT '',
      caption_in TEXT DEFAULT '',
      optimized_prompt TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      attempt_number INTEGER DEFAULT 1,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cover_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      attempt_number INTEGER DEFAULT 1,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT DEFAULT '',
      model_id TEXT NOT NULL,
      cost_cents REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pages_book_id ON pages(book_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_page_id ON image_attempts(page_id);
    CREATE INDEX IF NOT EXISTS idx_cover_attempts_book_id ON cover_attempts(book_id);
  `);

  // Lightweight column migrations for existing databases.
  const ensureColumn = (table, column, ddl) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`); }
    catch { /* already exists */ }
  };
  ensureColumn('books', 'audience', "TEXT DEFAULT ''");
  ensureColumn('books', 'notes', "TEXT DEFAULT ''");
  ensureColumn('books', 'cover_url', "TEXT DEFAULT ''");
  ensureColumn('pages', 'character_style', "TEXT DEFAULT ''");
  ensureColumn('pages', 'character_desc', "TEXT DEFAULT ''");
  ensureColumn('pages', 'caption', "TEXT DEFAULT ''");
  ensureColumn('pages', 'notes', "TEXT DEFAULT ''");
  ensureColumn('pages', 'text_in_image', 'INTEGER DEFAULT 0');
  ensureColumn('pages', 'title_in', "TEXT DEFAULT ''");
  ensureColumn('pages', 'caption_in', "TEXT DEFAULT ''");
  ensureColumn('pages', 'optimized_prompt', 'TEXT DEFAULT NULL');
}

init();

// ---------- Books ----------

export const listBooks = () =>
  db
    .prepare(
      `SELECT b.*, (
        SELECT COUNT(1) FROM pages p WHERE p.book_id = b.id
      ) AS pageCount
      FROM books b
      ORDER BY b.created_at DESC`
    )
    .all();

export const getBookWithPages = id => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!book) return null;
  const pages = db
    .prepare('SELECT * FROM pages WHERE book_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id);
  return { ...book, pages };
};

export const insertBook = ({ title, concept = '', tagLine = '', audience = '' }) => {
  const info = db
    .prepare(
      'INSERT INTO books (title, concept, tagLine, cover_url, audience) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, concept, tagLine, '', audience);
  return getBookWithPages(info.lastInsertRowid);
};

export const updateBook = (id, { notes, title, concept, tagLine, audience }) => {
  db.prepare(
    `UPDATE books SET
      title = COALESCE(?, title),
      concept = COALESCE(?, concept),
      tagLine = COALESCE(?, tagLine),
      audience = COALESCE(?, audience),
      notes = COALESCE(?, notes)
    WHERE id = ?`
  ).run(title ?? null, concept ?? null, tagLine ?? null, audience ?? null, notes ?? null, id);
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id);
};

export const deleteBook = id => {
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
};

export const updateBookCoverUrl = (bookId, coverUrl) => {
  db.prepare('UPDATE books SET cover_url = ? WHERE id = ?').run(coverUrl || '', bookId);
  return db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
};

// ---------- Pages ----------

export const insertPages = (bookId, pages = []) => {
  if (!pages.length) return [];
  const insert = db.prepare(
    `INSERT INTO pages
      (book_id, title, scene, prompt, character_style, image_url, sort_order, caption, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(items => {
    const ids = [];
    items.forEach((page, idx) => {
      const info = insert.run(
        bookId,
        page.title ?? '',
        page.scene ?? '',
        page.prompt ?? '',
        page.characterStyle ?? page.character_style ?? '',
        page.imageUrl ?? '',
        page.sort_order ?? page.sortOrder ?? idx,
        page.caption ?? '',
        page.notes ?? ''
      );
      ids.push(info.lastInsertRowid);
    });
    return ids;
  });
  const insertedIds = tx(pages);
  return db
    .prepare(
      `SELECT * FROM pages WHERE id IN (${insertedIds.map(() => '?').join(',')})
       ORDER BY sort_order ASC, id ASC`
    )
    .all(...insertedIds);
};

export const getPage = id =>
  db.prepare('SELECT * FROM pages WHERE id = ?').get(id);

export const updatePage = (id, fields = {}) => {
  const {
    title, scene, prompt, characterStyle, characterDesc, imageUrl, sortOrder,
    caption, notes, textInImage, titleIn, captionIn, optimizedPrompt,
  } = fields;

  const invalidateCache =
    (prompt !== undefined && prompt !== null) ||
    (scene !== undefined && scene !== null) ||
    (characterStyle !== undefined && characterStyle !== null);

  const useExplicitOptimized = invalidateCache || optimizedPrompt !== undefined;
  const optimizedVal = invalidateCache ? null : (optimizedPrompt ?? null);
  const optimizedSql = useExplicitOptimized
    ? 'optimized_prompt = ?'
    : 'optimized_prompt = optimized_prompt';

  const baseArgs = [
    title ?? null, scene ?? null, prompt ?? null, characterStyle ?? null,
    characterDesc ?? null, imageUrl ?? null, sortOrder ?? null,
    caption ?? null, notes ?? null,
    textInImage === undefined ? null : (textInImage ? 1 : 0),
    titleIn ?? null, captionIn ?? null,
  ];
  const args = useExplicitOptimized ? [...baseArgs, optimizedVal, id] : [...baseArgs, id];

  db.prepare(
    `UPDATE pages SET
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
      caption_in = COALESCE(?, caption_in),
      ${optimizedSql}
    WHERE id = ?`
  ).run(...args);

  return db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
};

export const deletePage = id => {
  db.prepare('DELETE FROM pages WHERE id = ?').run(id);
};

// ---------- Image attempts ----------

export const listImageAttempts = pageId =>
  db
    .prepare(
      `SELECT * FROM image_attempts WHERE page_id = ?
       ORDER BY attempt_number DESC, created_at DESC`
    )
    .all(pageId);

export const nextAttemptNumber = pageId => {
  const row = db
    .prepare('SELECT MAX(attempt_number) as maxNum FROM image_attempts WHERE page_id = ?')
    .get(pageId);
  return (row?.maxNum || 0) + 1;
};

export const insertImageAttempt = (pageId, url) => {
  const attemptNumber = nextAttemptNumber(pageId);
  const info = db
    .prepare(
      'INSERT INTO image_attempts (page_id, url, attempt_number, approved) VALUES (?, ?, ?, 0)'
    )
    .run(pageId, url, attemptNumber);
  return db.prepare('SELECT * FROM image_attempts WHERE id = ?').get(info.lastInsertRowid);
};

export const getImageAttempt = id =>
  db.prepare('SELECT * FROM image_attempts WHERE id = ?').get(id);

export const updateImageApproval = (id, approved) => {
  db.prepare('UPDATE image_attempts SET approved = ? WHERE id = ?').run(approved ? 1 : 0, id);
  return db.prepare('SELECT * FROM image_attempts WHERE id = ?').get(id);
};

export const deleteImageAttempt = id => {
  db.prepare('DELETE FROM image_attempts WHERE id = ?').run(id);
};

// ---------- Cover attempts ----------

export const listCoverAttempts = bookId =>
  db
    .prepare(
      `SELECT * FROM cover_attempts WHERE book_id = ?
       ORDER BY attempt_number DESC, created_at DESC`
    )
    .all(bookId);

export const nextCoverAttemptNumber = bookId => {
  const row = db
    .prepare('SELECT MAX(attempt_number) as maxNum FROM cover_attempts WHERE book_id = ?')
    .get(bookId);
  return (row?.maxNum || 0) + 1;
};

export const insertCoverAttempt = (bookId, url) => {
  const attemptNumber = nextCoverAttemptNumber(bookId);
  const info = db
    .prepare(
      'INSERT INTO cover_attempts (book_id, url, attempt_number, approved) VALUES (?, ?, ?, 0)'
    )
    .run(bookId, url, attemptNumber);
  return db.prepare('SELECT * FROM cover_attempts WHERE id = ?').get(info.lastInsertRowid);
};

export const getCoverAttempt = id =>
  db.prepare('SELECT * FROM cover_attempts WHERE id = ?').get(id);

export const updateCoverApproval = (id, approved) => {
  db.prepare('UPDATE cover_attempts SET approved = ? WHERE id = ?').run(approved ? 1 : 0, id);
  return db.prepare('SELECT * FROM cover_attempts WHERE id = ?').get(id);
};

export const deleteCoverAttempt = id => {
  db.prepare('DELETE FROM cover_attempts WHERE id = ?').run(id);
};

// ---------- Admin settings ----------

export const getAdminSetting = (key) => {
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
};

export const setAdminSetting = (key, value) => {
  const json = JSON.stringify(value);
  db.prepare(
    `INSERT INTO admin_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, json);
};

// ---------- Generation log ----------

export const logGeneration = (modelId, costCents, userEmail = '') => {
  db.prepare(
    'INSERT INTO generation_log (user_email, model_id, cost_cents) VALUES (?, ?, ?)'
  ).run(userEmail, modelId, costCents);
};

export const getGenerationStats = () => {
  const totals = db
    .prepare(
      `SELECT model_id, COUNT(*) as count, SUM(cost_cents) as total_cents
       FROM generation_log GROUP BY model_id ORDER BY total_cents DESC`
    )
    .all();
  const overall = db
    .prepare('SELECT COUNT(*) as count, SUM(cost_cents) as total_cents FROM generation_log')
    .get();
  const daily = db
    .prepare(
      `SELECT date(created_at) as day, COUNT(*) as count, SUM(cost_cents) as total_cents
       FROM generation_log
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all();
  return { totals, overall, daily };
};
