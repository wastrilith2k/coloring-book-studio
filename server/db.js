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
      created_at TEXT DEFAULT (datetime('now'))
    );

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

    CREATE INDEX IF NOT EXISTS idx_pages_book_id ON pages(book_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_page_id ON image_attempts(page_id);
    CREATE INDEX IF NOT EXISTS idx_cover_attempts_book_id ON cover_attempts(book_id);
  `);

  try {
    db.exec("ALTER TABLE pages ADD COLUMN character_style TEXT DEFAULT ''");
  } catch {
    // ignore if column already exists
  }

  try {
    db.exec("ALTER TABLE books ADD COLUMN cover_url TEXT DEFAULT ''");
  } catch {
    // ignore if column already exists
  }
}

init();

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
    .prepare(
      'SELECT * FROM pages WHERE book_id = ? ORDER BY sort_order ASC, id ASC'
    )
    .all(id);
  return { ...book, pages };
};

export const insertBook = ({ title, concept = '', tagLine = '' }) => {
  const info = db
    .prepare(
      'INSERT INTO books (title, concept, tagLine, cover_url) VALUES (?, ?, ?, "")'
    )
    .run(title, concept, tagLine);
  return getBookWithPages(info.lastInsertRowid);
};

export const insertPages = (bookId, pages = []) => {
  if (!pages.length) return [];
  const insert = db.prepare(
    'INSERT INTO pages (book_id, title, scene, prompt, character_style, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
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
        page.sort_order ?? page.sortOrder ?? idx
      );
      ids.push(info.lastInsertRowid);
    });
    return ids;
  });

  const insertedIds = tx(pages);
  return db
    .prepare(
      `SELECT * FROM pages WHERE id IN (${insertedIds
        .map(() => '?')
        .join(',')}) ORDER BY sort_order ASC, id ASC`
    )
    .all(...insertedIds);
};

export const listImageAttempts = pageId =>
  db
    .prepare(
      `SELECT * FROM image_attempts WHERE page_id = ?
       ORDER BY attempt_number DESC, created_at DESC`
    )
    .all(pageId);

export const nextAttemptNumber = pageId => {
  const row = db
    .prepare(
      'SELECT MAX(attempt_number) as maxNum FROM image_attempts WHERE page_id = ?'
    )
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
  const inserted = db
    .prepare('SELECT * FROM image_attempts WHERE id = ?')
    .get(info.lastInsertRowid);
  return inserted;
};

export const listCoverAttempts = bookId =>
  db
    .prepare(
      `SELECT * FROM cover_attempts WHERE book_id = ?
       ORDER BY attempt_number DESC, created_at DESC`
    )
    .all(bookId);

export const nextCoverAttemptNumber = bookId => {
  const row = db
    .prepare(
      'SELECT MAX(attempt_number) as maxNum FROM cover_attempts WHERE book_id = ?'
    )
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
  return db
    .prepare('SELECT * FROM cover_attempts WHERE id = ?')
    .get(info.lastInsertRowid);
};

export const getCoverAttempt = id =>
  db.prepare('SELECT * FROM cover_attempts WHERE id = ?').get(id);

export const updateCoverApproval = (id, approved) => {
  db.prepare('UPDATE cover_attempts SET approved = ? WHERE id = ?').run(
    approved ? 1 : 0,
    id
  );
  return db.prepare('SELECT * FROM cover_attempts WHERE id = ?').get(id);
};

export const deleteCoverAttempt = id => {
  db.prepare('DELETE FROM cover_attempts WHERE id = ?').run(id);
};

export const updateBookCoverUrl = (bookId, coverUrl) => {
  db.prepare('UPDATE books SET cover_url = ? WHERE id = ?').run(
    coverUrl || '',
    bookId
  );
  return db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
};

export const getImageAttempt = id =>
  db.prepare('SELECT * FROM image_attempts WHERE id = ?').get(id);

export const updateImageApproval = (id, approved) => {
  db.prepare('UPDATE image_attempts SET approved = ? WHERE id = ?').run(
    approved ? 1 : 0,
    id
  );
  return db.prepare('SELECT * FROM image_attempts WHERE id = ?').get(id);
};

export const deleteImageAttempt = id => {
  db.prepare('DELETE FROM image_attempts WHERE id = ?').run(id);
};

export const updatePage = (
  id,
  { title, scene, prompt, characterStyle, imageUrl, sortOrder }
) => {
  const stmt = db.prepare(
    `UPDATE pages SET
      title = COALESCE(?, title),
      scene = COALESCE(?, scene),
      prompt = COALESCE(?, prompt),
      character_style = COALESCE(?, character_style),
      image_url = COALESCE(?, image_url),
      sort_order = COALESCE(?, sort_order)
    WHERE id = ?`
  );
  stmt.run(title, scene, prompt, characterStyle, imageUrl, sortOrder, id);
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
};

export const getPage = id =>
  db.prepare('SELECT * FROM pages WHERE id = ?').get(id);

export const deleteBook = id => {
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
};

export const deletePage = id => {
  db.prepare('DELETE FROM pages WHERE id = ?').run(id);
};
