/** 云简 CloudNote API 客户端（在 background service worker 中调用）。 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

export interface UploadResult {
  name: string;
  /** 笔记相对路径，如 `assets/img-xxxx.png` —— 写进 Markdown 的图片引用就是这个 */
  relPath: string;
  fullPath: string;
  size: number;
}

const base = (server: string) => server.replace(/\/+$/, '');
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

async function errMsg(res: Response): Promise<string> {
  try {
    const d = (await res.json()) as { error?: string };
    return d.error ?? `请求失败（${res.status}）`;
  } catch {
    return `请求失败（${res.status}）`;
  }
}

/** 登录换取 JWT（开放模式 password 传空字符串即可）。 */
export async function login(server: string, password: string): Promise<string> {
  const res = await fetch(`${base(server)}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `登录失败（${res.status}）`);
  if (!data.token) throw new ApiError(401, '登录响应缺少 token');
  return data.token;
}

export async function getTree(server: string, token: string): Promise<TreeNode[]> {
  const res = await fetch(`${base(server)}/api/fs/tree`, { headers: authHeaders(token) });
  if (!res.ok) throw new ApiError(res.status, await errMsg(res));
  const data = (await res.json()) as { tree?: TreeNode[] };
  return data.tree ?? [];
}

/** 建目录，已存在（409）视为成功。 */
export async function createDir(server: string, token: string, path: string): Promise<void> {
  const res = await fetch(`${base(server)}/api/fs/create`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'dir' }),
  });
  if (!res.ok && res.status !== 409) throw new ApiError(res.status, await errMsg(res));
}

/** 上传图片/附件到 notePath 同级的 assets 目录，返回可嵌入 Markdown 的 relPath。 */
export async function uploadAsset(
  server: string,
  token: string,
  notePath: string,
  blob: Blob,
  filename: string,
): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', blob, filename);
  const res = await fetch(`${base(server)}/api/fs/upload?path=${encodeURIComponent(notePath)}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, await errMsg(res));
  return (await res.json()) as UploadResult;
}

/** 写（创建/覆盖）一篇 .md 笔记。 */
export async function putNote(
  server: string,
  token: string,
  path: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${base(server)}/api/fs/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new ApiError(res.status, await errMsg(res));
}
