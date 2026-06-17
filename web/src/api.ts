import type {
  DeleteResult,
  HealthInfo,
  LoginResult,
  NoteFile,
  TreeNode,
} from './types';

/**
 * 前端 API 客户端：统一鉴权头、错误处理与路径编码。
 * - token 存于 localStorage；
 * - 收到 401 自动清 token（由 AuthContext 负责将界面切回登录）；
 * - 路径参数含中文时统一 encodeURIComponent。
 */

const TOKEN_KEY = 'cloudnote_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isJsonBody = typeof init.body === 'string';
  if (isJsonBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) msg = data.error;
    } catch {
      /* 非 JSON 错误体 */
    }
    if (res.status === 401) clearToken();
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<HealthInfo>('/api/health'),

  login: (password: string) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // ── 文件系统 ─────────────────────────────────────────────
  tree: () => request<{ tree: TreeNode[] }>('/api/fs/tree'),

  readFile: (path: string) =>
    request<NoteFile>(`/api/fs/file?path=${enc(path)}`),

  writeFile: (path: string, content: string) =>
    request<NoteFile>(`/api/fs/file?path=${enc(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  create: (path: string, type: 'file' | 'dir', content = '') =>
    request<TreeNode>('/api/fs/create', {
      method: 'POST',
      body: JSON.stringify({ path, type, content }),
    }),

  rename: (from: string, to: string) =>
    request<{ from: string; to: string; type: string }>('/api/fs/rename', {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),

  remove: (path: string) =>
    request<DeleteResult>(`/api/fs/delete?path=${enc(path)}`, { method: 'DELETE' }),

  /** 上传端点（Step 5 BlockNote 拖拽/粘贴时用，需自行附带 Authorization 头）。 */
  uploadUrl: (notePath: string) => `/api/fs/upload?path=${enc(notePath)}`,

  /** 附件渲染 URL（<img src> 无法带头部，故附 ?token=）。 */
  assetUrl: (fullPath: string) => {
    const token = getToken();
    const query = `path=${enc(fullPath)}${token ? `&token=${enc(token)}` : ''}`;
    return `/api/fs/asset?${query}`;
  },
};
