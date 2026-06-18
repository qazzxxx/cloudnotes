import { Readable } from 'node:stream';
import { Router } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../lib/asyncHandler';
import { FsError } from '../lib/paths';

export const aiRouter = Router();

/**
 * BlockNote AI 后端代理（OpenAI 兼容）。
 * - 前端用 ClientSideTransport 在客户端跑 AI SDK，模型 baseURL 指向同源 `/api/ai`；
 * - 本路由把 `/chat/completions` 请求注入服务端 `AI_API_KEY` 后流式转发到 `AI_BASE_URL`，
 *   SSE 响应原样回传（Key 全程不出服务端）。
 * - 目标端点固定为配置值，前端无法指定任意 URL（防 SSRF / 开放代理）。
 */

// GET /api/ai/config —— 前端据此决定是否启用 AI（不含密钥）
aiRouter.get('/config', (_req, res) => {
  res.json({ enabled: env.aiEnabled, model: env.aiModel });
});

// POST /api/ai/chat/completions —— 流式反代
aiRouter.post(
  '/chat/completions',
  asyncHandler(async (req, res) => {
    if (!env.aiEnabled) {
      throw new FsError(503, 'AI 未启用（需配置 AI_BASE_URL / AI_API_KEY / AI_MODEL）');
    }
    const target = `${env.aiBaseUrl.replace(/\/+$/, '')}/chat/completions`;

    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${env.aiApiKey}`,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    // 透传状态码与响应类型；关闭缓冲保证 SSE 实时
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!upstream.body) {
      res.end();
      return;
    }
    // Node 20：web ReadableStream → Node 流，直接 pipe（不缓冲）
    Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream).pipe(res);
  }),
);
