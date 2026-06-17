import type { Request, RequestHandler } from 'express';
import { env } from '../config/env';
import { verifyToken } from '../lib/jwt';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  // <img src> 无法携带 Authorization 头，故附件类请求允许 ?token= 传递
  const q = req.query.token;
  return typeof q === 'string' && q.length > 0 ? q : null;
}

/**
 * 鉴权中间件。
 * - 开放模式（未设置 NAS_PASSWORD）：直接放行。
 * - 否则：校验 Authorization: Bearer <token>。
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!env.authEnabled) return next();

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: '未授权：缺少 token' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '未授权：token 无效或已过期' });
  }
  req.user = payload;
  next();
};
