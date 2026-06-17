import { Router } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

/** 健康检查 & 启动信息（公开接口）。 */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'cloudnote',
    authEnabled: env.authEnabled,
    rootSpace: env.rootSpace,
    time: new Date().toISOString(),
  });
});
