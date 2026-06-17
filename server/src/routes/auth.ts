import { Router } from 'express';
import { env } from '../config/env';
import { signToken } from '../lib/jwt';

export const authRouter = Router();

/** 查询当前鉴权模式（前端据此决定是否需要展示登录页）。 */
authRouter.get('/status', (_req, res) => {
  res.json({ authEnabled: env.authEnabled });
});

/**
 * 登录。
 * - 开放模式：直接下发 token。
 * - 鉴权模式：校验 password === NAS_PASSWORD，成功下发 JWT。
 */
authRouter.post('/login', (req, res) => {
  const { password } = (req.body ?? {}) as { password?: string };

  if (!env.authEnabled) {
    return res.json({ token: signToken(), authEnabled: false });
  }

  if (typeof password !== 'string' || password !== env.nasPassword) {
    return res.status(401).json({ error: '密码错误' });
  }

  return res.json({ token: signToken(), authEnabled: true });
});
