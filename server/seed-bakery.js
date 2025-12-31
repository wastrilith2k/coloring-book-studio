import { BAKERY_WITCH_BOOK } from '../data/bakeryWitch.js';
import { db, insertBook, insertPages, getBookWithPages } from './db.js';

const main = () => {
  const { title, tagLine, characterGuide, pages } = BAKERY_WITCH_BOOK;

  const existing = db.prepare('SELECT id FROM books WHERE title = ?').get(title);
  if (existing) {
    console.log(`Book already exists with id ${existing.id}`);
    const current = getBookWithPages(existing.id);
    console.log(`Pages present: ${current.pages.length}`);
    return;
  }

  const book = insertBook({ title, concept: characterGuide, tagLine });
  const normalizedPages = pages.map((p, idx) => ({
    title: p.title,
    scene: p.scene,
    prompt: p.prompt ?? p.scene,
    imageUrl: p.imageUrl ?? '',
    sort_order: p.sortOrder ?? idx,
  }));

  insertPages(book.id, normalizedPages);
  const saved = getBookWithPages(book.id);
  console.log(`Saved book #${saved.id} with ${saved.pages.length} pages`);
};

main();
