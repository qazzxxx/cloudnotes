import {
  ApiError,
  createDir,
  getTree,
  login,
  putNote,
  uploadAsset,
} from './lib/api';
import { assembleMarkdown, substituteImages } from './lib/markdown';
import { collectPaths, sanitizeTitle, uniqueNotePath } from './lib/sanitize';
import { getConfig, getToken, setToken } from './lib/store';
import type {
  ExtractResponse,
  ProgressMessage,
  ResultMessage,
  SaveMessage,
} from './lib/types';

/** 云简允许的图片扩展名（与 server assets.ts 一致）。 */
const ALLOWED_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
]);
const MAX_BYTES = 20 * 1024 * 1024;

/** 带自动重登的请求封装：遇 401 用密码重新登录并重试一次。 */
async function makeAuth(server: string, password: string) {
  let token = (await getToken()) ?? '';
  if (!token) {
    token = await login(server, password);
    await setToken(token);
  }
  const req = async <T>(fn: (server: string, token: string) => Promise<T>): Promise<T> => {
    try {
      return await fn(server, token);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        token = await login(server, password);
        await setToken(token);
        return await fn(server, token);
      }
      throw e;
    }
  };
  return { req };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as SaveMessage;
  if (m?.type !== 'CN_SAVE') return;
  onSave()
    .then(
      (notePath) => finish(true, notePath),
      (e) => finish(false, undefined, e instanceof Error ? e.message : String(e)),
    );
  return true; // 异步响应（ack）
});

function progress(text: string): void {
  const pm: ProgressMessage = { type: 'CN_PROGRESS', text };
  chrome.runtime.sendMessage(pm).catch(() => {
    /* popup 可能已关 */
  });
}

function finish(ok: boolean, notePath?: string, error?: string): void {
  const rm: ResultMessage = { type: 'CN_RESULT', ok, notePath, error };
  chrome.runtime.sendMessage(rm).catch(() => {
    /* popup 可能已关 */
  });
}

async function onSave(): Promise<string> {
  const cfg = await getConfig();
  if (!cfg.server) throw new Error('请先在扩展设置里填写云简服务器地址');

  const tab = await activeTab();
  if (!tab || tab.id == null || tab.url == null) throw new Error('找不到当前标签页');
  if (!/^https?:\/\//i.test(tab.url)) {
    throw new Error('请在普通网页（http/https）上使用，不支持浏览器内置页面');
  }

  progress('正在提取网页…');
  const resp = await extractFromTab(tab.id);
  if (!resp.ok) throw new Error(resp.error);
  const data = resp.data;

  const { req } = await makeAuth(cfg.server, cfg.password);
  const folder = cfg.folder || '网页剪藏';

  progress('准备目录…');
  await req((s, t) => createDir(s, t, folder));
  const tree = await req((s, t) => getTree(s, t));
  const existing = collectPaths(tree);
  const notePath = uniqueNotePath(existing, folder, sanitizeTitle(data.title));

  // 逐张抓取并上传图片（跨域在 background 抓取，受 host_permissions 保护）
  const urlToRel = new Map<string, string>();
  const total = data.imageUrls.length;
  let idx = 0;
  for (const imgUrl of data.imageUrls) {
    idx += 1;
    progress(total > 0 ? `上传图片 ${idx}/${total}` : '处理中…');
    try {
      const blob = await fetchBlob(imgUrl);
      const ext = pickExt(imgUrl, blob);
      if (!ALLOWED_EXTS.has(ext) || blob.size > MAX_BYTES) continue;
      const up = await req((s, t) => uploadAsset(s, t, notePath, blob, fileName(imgUrl, ext)));
      urlToRel.set(imgUrl, up.relPath);
    } catch {
      /* 单张失败跳过，不中断整体 */
    }
  }

  const body = substituteImages(data.markdown, urlToRel);
  const content = assembleMarkdown({
    title: data.title,
    body,
    url: data.url,
    byline: data.byline,
  });

  progress('正在保存笔记…');
  await req((s, t) => putNote(s, t, notePath, content));
  return notePath;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function extractFromTab(tabId: number): Promise<ExtractResponse> {
  return chrome.tabs.sendMessage(tabId, { type: 'CN_EXTRACT' }).catch(() => {
    throw new Error('无法与页面通信：请刷新当前页面后重试（扩展刚安装/更新时，已打开的页面需刷新才会注入内容脚本）。');
  });
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`图片请求失败（${res.status}）`);
  return await res.blob();
}

/** 从 URL 路径推断扩展名，回退到 blob 的 MIME。 */
function pickExt(url: string, blob: Blob): string {
  try {
    const last = new URL(url).pathname.split('/').pop() ?? '';
    const dot = last.lastIndexOf('.');
    if (dot >= 0) return last.slice(dot + 1).toLowerCase();
  } catch {
    /* ignore */
  }
  return (blob.type.split('/')[1] ?? '').toLowerCase();
}

/** 给上传的图片一个原始文件名（后端据此识别扩展名 + 生成随机化新名）。 */
function fileName(url: string, ext: string): string {
  try {
    const last = (new URL(url).pathname.split('/').pop() ?? '').split('?')[0]!;
    const base = (last.split('.')[0] ?? '').trim();
    return `${base || 'image'}.${ext}`;
  } catch {
    return `image.${ext}`;
  }
}
