import {
  listBooks,
  getBookWithPages,
  insertBook,
  insertPages,
  deleteBook,
  verifyBookOwnership,
  listCoverAttempts,
  insertCoverAttempt,
  getCoverAttempt,
  updateCoverApproval,
  deleteCoverAttempt,
  updateBookCoverUrl,
  nextCoverAttemptNumber,
} from '../../lib/db.js';
import { uploadToS3, getPresignedUrl, buildCoverKey } from '../../lib/s3.js';
import { json, noContent } from '../../lib/cors.js';

const resolvePresignedUrls = async (items, urlField = 'url') => {
  return Promise.all(items.map(async (item) => {
    if (item[urlField] && item[urlField].startsWith('users/')) {
      return { ...item, [urlField]: await getPresignedUrl(item[urlField]) };
    }
    return item;
  }));
};

const resolveBookUrls = async (book) => {
  if (!book) return book;
  if (book.cover_url && book.cover_url.startsWith('users/')) {
    book = { ...book, cover_url: await getPresignedUrl(book.cover_url) };
  }
  if (book.pages) {
    book = {
      ...book,
      pages: await Promise.all(book.pages.map(async (p) => {
        if (p.image_url && p.image_url.startsWith('users/')) {
          return { ...p, image_url: await getPresignedUrl(p.image_url) };
        }
        return p;
      })),
    };
  }
  return book;
};

const parseBookPath = (path) => {
  const match = path.match(/^\/api\/books(?:\/(\d+))?(?:\/(.*))?$/);
  if (!match) return {};
  return { bookId: match[1] ? Number(match[1]) : null, rest: match[2] || '' };
};

export const handleBooks = async (ctx) => {
  const { userId, method, path, body, origin } = ctx;
  const { bookId, rest } = parseBookPath(path);

  // --- Cover image routes: /api/books/:id/cover/images... ---
  if (bookId && rest.startsWith('cover/images')) {
    if (!(await verifyBookOwnership(bookId, userId))) {
      return json(404, { error: 'book not found' }, origin);
    }

    // DELETE /api/books/:id/cover/images/:imageId
    const deleteMatch = rest.match(/^cover\/images\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const imageId = Number(deleteMatch[1]);
      const attempt = await getCoverAttempt(imageId);
      if (!attempt || Number(attempt.book_id) !== bookId) return json(404, { error: 'image not found' }, origin);
      await deleteCoverAttempt(imageId);
      return noContent(origin);
    }

    // POST /api/books/:id/cover/images/:imageId/approve
    const approveMatch = rest.match(/^cover\/images\/(\d+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const imageId = Number(approveMatch[1]);
      const attempt = await getCoverAttempt(imageId);
      if (!attempt || Number(attempt.book_id) !== bookId) return json(404, { error: 'image not found' }, origin);
      const { approved = true } = body;
      const updated = await updateCoverApproval(imageId, approved);
      if (approved) {
        await updateBookCoverUrl(bookId, updated.url);
      } else {
        await updateBookCoverUrl(bookId, '');
      }
      const resolved = (await resolvePresignedUrls([updated]))[0];
      return json(200, { image: resolved }, origin);
    }

    // GET /api/books/:id/cover/images
    if (rest === 'cover/images' && method === 'GET') {
      const images = await listCoverAttempts(bookId);
      return json(200, { images: await resolvePresignedUrls(images) }, origin);
    }

    // POST /api/books/:id/cover/images
    if (rest === 'cover/images' && method === 'POST') {
      const { dataUrl } = body;
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return json(400, { error: 'dataUrl image required' }, origin);
      }
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      if (!isValidBase64(base64Data)) {
        return json(400, { error: 'Invalid base64 image data' }, origin);
      }
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        return json(400, { error: 'Image too large (max 10MB)' }, origin);
      }
      const attemptNum = await nextCoverAttemptNumber(bookId);
      const key = buildCoverKey(userId, bookId, attemptNum);
      await uploadToS3(buffer, key);
      const attempt = await insertCoverAttempt(bookId, key);
      const resolved = (await resolvePresignedUrls([attempt]))[0];
      return json(201, { image: resolved }, origin);
    }
  }

  // --- Page routes: /api/books/:id/pages ---
  if (bookId && rest === 'pages' && method === 'POST') {
    if (!(await verifyBookOwnership(bookId, userId))) {
      return json(404, { error: 'book not found' }, origin);
    }
    const { pages = [] } = body;
    if (!Array.isArray(pages) || !pages.length) {
      return json(400, { error: 'pages array required' }, origin);
    }
    const inserted = await insertPages(bookId, pages);
    return json(201, { pages: inserted }, origin);
  }

  // --- Download: /api/books/:id/download ---
  if (bookId && rest === 'download' && method === 'GET') {
    if (!(await verifyBookOwnership(bookId, userId))) {
      return json(404, { error: 'book not found' }, origin);
    }
    const book = await getBookWithPages(bookId, userId);
    if (!book) return json(404, { error: 'book not found' }, origin);
    const pages = book.pages || [];
    if (!pages.length) return json(400, { error: 'book has no pages to download' }, origin);

    const missingPages = pages.filter(p => !p.image_url);
    const missingCover = book.cover_url ? [] : ['cover'];
    if (missingPages.length + missingCover.length) {
      return json(400, { error: 'Not all pages have approved images' }, origin);
    }

    const files = [];
    if (book.cover_url) {
      files.push({
        name: '00-cover.png',
        url: book.cover_url.startsWith('users/') ? await getPresignedUrl(book.cover_url) : book.cover_url,
      });
    }
    for (const page of pages) {
      const url = page.image_url.startsWith('users/')
        ? await getPresignedUrl(page.image_url)
        : page.image_url;
      const slug = (page.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      files.push({
        name: `${String(page.sort_order ?? page.id).padStart(2, '0')}-${slug}.png`,
        url,
      });
    }
    return json(200, { files, title: book.title }, origin);
  }

  // --- DELETE /api/books/:id ---
  if (bookId && !rest && method === 'DELETE') {
    if (!(await verifyBookOwnership(bookId, userId))) {
      return json(404, { error: 'book not found' }, origin);
    }
    await deleteBook(bookId);
    return noContent(origin);
  }

  // --- GET /api/books/:id ---
  if (bookId && !rest && method === 'GET') {
    const book = await getBookWithPages(bookId, userId);
    if (!book) return json(404, { error: 'Not found' }, origin);
    return json(200, { book: await resolveBookUrls(book) }, origin);
  }

  // --- POST /api/books ---
  if (!bookId && !rest && method === 'POST') {
    const { title, concept = '', tagLine = '', pages = [] } = body;
    if (!title) return json(400, { error: 'title is required' }, origin);
    const book = await insertBook(userId, { title, concept, tagLine });
    if (pages.length) {
      await insertPages(book.id, pages);
    }
    const withPages = await getBookWithPages(book.id, userId);
    return json(201, { book: withPages }, origin);
  }

  // --- GET /api/books ---
  if (!bookId && !rest && method === 'GET') {
    const books = await listBooks(userId);
    return json(200, { books: await resolvePresignedUrls(books, 'cover_url') }, origin);
  }

  return json(404, { error: 'Not found' }, origin);
};

function isValidBase64(str) {
  if (!str || str.length === 0) return false;
  try {
    return Buffer.from(str, 'base64').toString('base64') === str.replace(/\s/g, '');
  } catch {
    return false;
  }
}
