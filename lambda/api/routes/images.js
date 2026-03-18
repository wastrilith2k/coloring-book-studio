// This module is a placeholder — image routes are handled inline within
// books.js (cover images) and pages.js (page images) since they need
// the parent resource context for ownership verification.
// Kept as a named export so the handler import doesn't break if referenced.

export const handleImages = async () => ({
  statusCode: 404,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'Use /api/pages/:id/images or /api/books/:id/cover/images' }),
});
