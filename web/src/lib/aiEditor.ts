import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AIExtension, ClientSideTransport } from '@blocknote/xl-ai';
import { getToken } from '../api';

/**
 * BlockNote AI 编辑器装配。
 *
 * 链路：前端用 ClientSideTransport 在客户端跑 AI SDK；模型的 baseURL 指向同源 `/api/ai`，
 * 由后端流式反代到真实 LLM 端点并注入服务端 Key（Key 全程不出服务端）。
 * 这里只负责构造 model → transport → AIExtension。
 */

/** 自定义 fetch：给发往 /api/ai 的请求带上本服务 JWT（后端 requireAuth 校验）。 */
function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** 构造 AI 扩展（仅在 AI 启用时调用）。返回 ExtensionFactoryInstance，可直接放进编辑器 extensions。 */
export function createAIExtensionFor(modelName: string) {
  const provider = createOpenAICompatible({
    name: 'cloudnote-ai',
    // baseURL 同源 /api/ai：openai-compatible 会拼成 /api/ai/chat/completions
    baseURL: '/api/ai',
    apiKey: 'unused', // 真实 Key 由后端代理注入，这里占位
    fetch: authedFetch,
  });
  const model = provider(modelName);
  const transport = new ClientSideTransport({ model });
  return AIExtension({ transport, agentCursor: { name: '云简 AI', color: '#5b6cff' } });
}
