import {
  getPageWithBookOwnership,
  updatePage,
  deletePage,
  listImageAttempts,
  insertImageAttempt,
  getImageAttempt,
  updateImageApproval,
  deleteImageAttempt,
  nextAttemptNumber,
} from '../../lib/db.js';
import { uploadToS3, getPresignedUrl, getObjectBuffer, objectExists, buildImageKey } from '../../lib/s3.js';
import { printKey, upscaleForPrint } from '../../lib/image.js';
import { json, noContent } from '../../lib/cors.js';

const resolvePresignedUrls = async (items, urlField = 'url') => {
  return Promise.all(items.map(async (item) => {
    if (item[urlField] && item[urlField].startsWith('users/')) {
      return { ...item, [urlField]: await getPresignedUrl(item[urlField]) };
    }
    return item;
  }));
};

const parsePagePath = (path) => {
  const match = path.match(/^\/api\/pages(?:\/(\d+))?(?:\/(.*))?$/);
  if (!match) return {};
  return { pageId: match[1] ? Number(match[1]) : null, rest: match[2] || '' };
};

export const handlePages = async (ctx) => {
  const { userId, method, path, body, origin } = ctx;
  const { pageId, rest } = parsePagePath(path);

  if (!pageId) return json(400, { error: 'invalid page id' }, origin);

  // Verify ownership through book — this gates ALL page operations
  const page = await getPageWithBookOwnership(pageId, userId);
  if (!page) return json(404, { error: 'page not found' }, origin);

  // --- Image attempt routes: /api/pages/:id/images... ---
  if (rest.startsWith('images')) {
    // DELETE /api/pages/:pageId/images/:imageId
    const deleteMatch = rest.match(/^images\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const imageId = Number(deleteMatch[1]);
      const attempt = await getImageAttempt(imageId);
      if (!attempt || Number(attempt.page_id) !== pageId) return json(404, { error: 'image not found' }, origin);
      await deleteImageAttempt(imageId);
      return noContent(origin);
    }

    // POST /api/pages/:pageId/images/:imageId/approve
    const approveMatch = rest.match(/^images\/(\d+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const imageId = Number(approveMatch[1]);
      const attempt = await getImageAttempt(imageId);
      if (!attempt || Number(attempt.page_id) !== pageId) return json(404, { error: 'image not found' }, origin);
      const { approved = true } = body;
      // Deselect all other approved images for this page before approving
      if (approved) {
        const allAttempts = await listImageAttempts(pageId);
        for (const a of allAttempts) {
          if (a.approved && a.id !== imageId) {
            await updateImageApproval(a.id, false);
          }
        }
      }
      const updated = await updateImageApproval(imageId, approved);
      if (approved) {
        // Upscale to print resolution if not already done
        const pKey = printKey(updated.url);
        if (!(await objectExists(pKey))) {
          const original = await getObjectBuffer(updated.url);
          const upscaled = await upscaleForPrint(original);
          await uploadToS3(upscaled, pKey);
        }
        await updatePage(pageId, { imageUrl: pKey });
      }
      const resolved = (await resolvePresignedUrls([updated]))[0];
      return json(200, { image: resolved }, origin);
    }

    // GET /api/pages/:id/images
    if (rest === 'images' && method === 'GET') {
      const images = await listImageAttempts(pageId);
      return json(200, { images: await resolvePresignedUrls(images) }, origin);
    }

    // POST /api/pages/:id/images
    if (rest === 'images' && method === 'POST') {
      const { dataUrl } = body;
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return json(400, { error: 'dataUrl image required' }, origin);
      }
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        return json(400, { error: 'Image too large (max 10MB)' }, origin);
      }
      const attemptNum = await nextAttemptNumber(pageId);
      const key = buildImageKey(userId, page.book_id, pageId, attemptNum);
      await uploadToS3(buffer, key);
      const attempt = await insertImageAttempt(pageId, key);
      const resolved = (await resolvePresignedUrls([attempt]))[0];
      return json(201, { image: resolved }, origin);
    }
  }

  // --- PUT /api/pages/:id ---
  if (!rest && method === 'PUT') {
    const updated = await updatePage(pageId, body);
    if (!updated) return json(404, { error: 'not found' }, origin);
    return json(200, { page: updated }, origin);
  }

  // --- DELETE /api/pages/:id ---
  if (!rest && method === 'DELETE') {
    await deletePage(pageId);
    return noContent(origin);
  }

  return json(404, { error: 'Not found' }, origin);
};
