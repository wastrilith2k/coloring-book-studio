import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, '..', 'uploads');
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || ''; // e.g. http://localhost:8788; empty means relative

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const uploadsDir = UPLOADS_DIR;

const extFromMime = (mime) => {
  if (!mime) return 'png';
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const parseDataUrl = (dataUrl) => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('invalid data URL');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
};

const publicUrlFor = (filename) => {
  const path = `/uploads/${filename}`;
  return PUBLIC_BASE ? `${PUBLIC_BASE.replace(/\/$/, '')}${path}` : path;
};

/**
 * Save a data URL to local uploads/ and return a public URL.
 * Mirrors the Cloudinary upload signature so existing callers stay simple.
 */
export const saveDataUrl = async (dataUrl, { folder = '' } = {}) => {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = extFromMime(mime);
  const id = crypto.randomBytes(16).toString('hex');
  const filename = folder ? `${folder}-${id}.${ext}` : `${id}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(fullPath, buffer);
  return { secure_url: publicUrlFor(filename), filename, bytes: buffer.length };
};

/**
 * Delete a previously-saved upload by URL or filename. Best-effort, never throws.
 */
export const deleteUpload = async (urlOrName) => {
  if (!urlOrName) return;
  const filename = urlOrName.split('/').pop();
  if (!filename) return;
  const fullPath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.promises.unlink(fullPath);
  } catch {
    // ignore
  }
};
