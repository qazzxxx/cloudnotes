/** chrome.storage.local 封装：服务器/密码/文件夹配置 + 缓存的登录 token。 */

const KEYS = {
  server: 'cn_server',
  password: 'cn_password',
  folder: 'cn_folder',
  token: 'cn_token',
} as const;

const DEFAULT_FOLDER = '网页剪藏';

export interface Config {
  /** 云简服务地址，如 http://nas-ip:3130（无尾斜杠） */
  server: string;
  /** 登录密码（开放模式留空） */
  password: string;
  /** 剪藏笔记存放文件夹（笔记相对路径第一段） */
  folder: string;
}

export async function getConfig(): Promise<Config> {
  const v = await chrome.storage.local.get(Object.values(KEYS));
  return {
    server: (v[KEYS.server] as string | undefined)?.trim() ?? '',
    password: (v[KEYS.password] as string | undefined) ?? '',
    folder: (v[KEYS.folder] as string | undefined)?.trim() || DEFAULT_FOLDER,
  };
}

export async function setConfig(patch: Partial<Config>): Promise<void> {
  const up: Record<string, unknown> = {};
  if (patch.server !== undefined) up[KEYS.server] = patch.server.trim();
  if (patch.password !== undefined) up[KEYS.password] = patch.password;
  if (patch.folder !== undefined) up[KEYS.folder] = patch.folder.trim() || DEFAULT_FOLDER;
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
