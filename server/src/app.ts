import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { requireAuth } from './middleware/auth';
import { FsError } from './lib/paths';
import { authRouter } from './routes/auth';
import { fsRouter } from './routes/fs';
import { healthRouter } from './routes/health';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigin ?? true }));
  app.use(express.json({ limit: '12mb' })); // 含 base64 图片时 body 较大
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) app.use(morgan('dev'));

  // ── 公开接口 ──────────────────────────────────────────────
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // ── 受保护接口：文件系统操作（需鉴权） ────────────────────
  app.use('/api/fs', requireAuth, fsRouter);

  // 未匹配的 /api/* → JSON 404（须在 SPA fallback 之前）
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not Found' }));

  // ── 前端托管 ──────────────────────────────────────────────
  //   生产（单容器）：托管 web/dist，`/` 与所有非 /api 路由回退到 index.html
  //   开发：前端由 Vite 在 :5173 提供；此处给一个 API 提示
  //   dist/app.js → server/dist；../../web/dist 即 monorepo 根下的 web/dist
  const webDist = process.env.WEB_DIST_DIR
    ? path.resolve(process.env.WEB_DIST_DIR)
    : path.resolve(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.json({
        name: 'CloudNote API',
        ok: true,
        authEnabled: env.authEnabled,
        hint: '开发模式下前端由 Vite 在 http://localhost:5173 提供',
      }),
    );
  }

  // ── 全局错误处理（须放在所有路由之后） ────────────────────
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof FsError) {
      return res.status(err.status).json({ error: err.message });
    }
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return res.status(404).json({ error: '文件或目录不存在' });
    if (code === 'EEXIST') return res.status(409).json({ error: '目标已存在' });
    if (code === 'EACCES' || code === 'EPERM') {
      return res.status(403).json({ error: '权限不足' });
    }
    console.error('[unhandled error]', err);
    res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}
