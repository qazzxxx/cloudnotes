/** chrome.storage.local 封装：服务器/密码/文件夹配置 + 缓存的登录 token。 */

const KEYS = {
  server: 'cn_server',
  password: 'cn_password',
  folder: 'cn_folder',
  token: 'cn_token',
  autoScroll: 'cn_autoscroll',
  autoScrollMaxMs: 'cn_autoscroll_maxms',
} as const;

const DEFAULT_FOLDER = '网页剪藏';
const DEFAULT_AUTO_SCROLL = true;
const DEFAULT_AUTO_SCROLL_MAX_MS = 8000;

export interface Config {
  /** 云简服务地址，如 http://nas-ip:3130（无尾斜杠） */
  server: string;
  /** 登录密码（开放模式留空） */
  password: string;
  /** 剪藏笔记存放文件夹（笔记相对路径第一段） */
  folder: string;
  /** 保存前是否自动滚动页面，加载无限滚动/懒加载的完整内容 */
  autoScroll: boolean;
  /** 自动滚动的最长耗时（毫秒），到点即停 */
  autoScrollMaxMs: number;
}

export async function getConfig(): Promise<Config> {
  const v = await chrome.storage.local.get(Object.values(KEYS));
  return {
    server: (v[KEYS.server] as string | undefined)?.trim() ?? '',
    password: (v[KEYS.password] as string | undefined) ?? '',
    folder: (v[KEYS.folder] as string | undefined)?.trim() || DEFAULT_FOLDER,
    autoScroll:
      v[KEYS.autoScroll] === undefined ? DEFAULT_AUTO_SCROLL : v[KEYS.autoScroll] === true,
    autoScrollMaxMs:
      Number(v[KEYS.autoScrollMaxMs]) > 0
        ? Number(v[KEYS.autoScrollMaxMs])
        : DEFAULT_AUTO_SCROLL_MAX_MS,
  };
}

export async function setConfig(patch: Partial<Config>): Promise<void> {
  const up: Record<string, unknown> = {};
  if (patch.server !== undefined) up[KEYS.server] = patch.server.trim();
  if (patch.password !== undefined) up[KEYS.password] = patch.password;
  if (patch.folder !== undefined) up[KEYS.folder] = patch.folder.trim() || DEFAULT_FOLDER;
  if (patch.autoScroll !== undefined) up[KEYS.autoScroll] = patch.autoScroll;
  if (patch.autoScrollMaxMs !== undefined && patch.autoScrollMaxMs > 0)
    up[KEYS.autoScrollMaxMs] = patch.autoScrollMaxMs;
  await chrome.storage.local.set(up);
}

export async function getToken(): Promise<string | null> {
  const v = await chrome.storage.local.get(KEYS.token);
  return (v[KEYS.token] as string | undefined) ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await chrome.storage.local.set({ [KEYS.token]: token });
  else await chrome.storage.local.remove(KEYS.token);
}
