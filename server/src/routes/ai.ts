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

    // 注入 max_tokens：BlockNote 0.51.4 客户端不设 maxOutputTokens，
    // 推理模型（如 MiniMax-M2）的 <think> 会吃掉默认预算 → 正文/工具调用被截断 → 只写一行。
    // 服务端强制注入大值，给推理 + 完整正文留足空间。
    const body = { ...(req.body ?? {}) } as Record<string, unknown>;
    if (body.max_tokens == null && body.max_output_tokens == null) {
      body.max_tokens = env.aiMaxTokens;
    }

    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${env.aiApiKey}`,
      },
      body: JSON.stringify(body),
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
