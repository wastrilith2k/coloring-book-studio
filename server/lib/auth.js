import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const TOKEN_TTL = '7d';

const getSecret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required');
  if (s.length < 16) throw new Error('AUTH_SECRET must be at least 16 characters');
  return s;
};

const getAdminEmail = () => {
  const e = process.env.ADMIN_EMAIL;
  if (!e) throw new Error('ADMIN_EMAIL is required');
  return e.toLowerCase().trim();
};

/**
 * Returns the bcrypt hash of the admin password.
 * Accepts either a pre-hashed hash via ADMIN_PASSWORD_HASH, or a plaintext
 * password via ADMIN_PASSWORD which is hashed in-memory at startup. The hash
 * is computed once and cached.
 */
let cachedHash = null;
const getAdminPasswordHash = () => {
  if (cachedHash) return cachedHash;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) {
    cachedHash = hash;
    return hash;
  }
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) {
    throw new Error('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required');
  }
  cachedHash = bcrypt.hashSync(plain, 10);
  return cachedHash;
};

export const verifyCredentials = async (email, password) => {
  if (!email || !password) return null;
  if (email.toLowerCase().trim() !== getAdminEmail()) return null;
  const ok = await bcrypt.compare(password, getAdminPasswordHash());
  if (!ok) return null;
  return { sub: 'admin', email: getAdminEmail(), role: 'admin' };
};

export const issueToken = (user) =>
  jwt.sign(user, getSecret(), { expiresIn: TOKEN_TTL, algorithm: 'HS256' });

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
};

/**
 * Express middleware: requires a valid Bearer JWT.
 * Populates req.user = { sub, email, role }.
 */
export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return res.status(401).json({ error: 'unauthorized' });
  const decoded = verifyToken(match[1]);
  if (!decoded) return res.status(401).json({ error: 'invalid token' });
  req.user = decoded;
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  next();
};
