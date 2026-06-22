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

type SaveOutcome =
  | { ok: true; notePath: string; skipped: number; total: number }
  | { ok: false; error: string };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as SaveMessage;
  if (m?.type !== 'CN_SAVE') return;
  (async () => {
    await enableCorsBypass(); // 保存期间给图片响应注入 CORS 头，抓跨域图床
    try {
      const r = await onSave();
      finish({ ok: true, notePath: r.notePath, skipped: r.skipped, total: r.total });
    } catch (e) {
      finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      void disableCorsBypass();
    }
  })();
  return true; // 异步响应（ack）
});

/**
 * 临时给「图片类响应」注入 Access-Control-Allow-Origin: *，让 fetch 能读到跨域图床
 * （如 tu.ewrewej.la 这类无 CORS 头的 CDN）的字节。仅在保存期间开启，结束即移除。
 */
const CORS_RULE_ID = 1;
async function enableCorsBypass(): Promise<void> {
  // 给图片类响应注入 ACAO:*，让 fetch 能读跨域图床字节。@types/chrome 的 DNR 类型偏严，
  // 这里用 any 规则对象 + Promise.resolve 包裹（运行时 API 完全支持 modifyHeaders / 返回 Promise）。
  const rule: any = {
    id: CORS_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'access-control-allow-origin', operation: 'set', value: '*' },
        { header: 'access-control-allow-credentials', operation: 'remove' },
      ],
    },
    condition: { resourceTypes: ['xmlhttprequest', 'image'] },
  };
  await Promise.resolve(
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [CORS_RULE_ID],
      addRules: [rule],
    }),
  );
}
async function disableCorsBypass(): Promise<void> {
  await Promise.resolve(
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [CORS_RULE_ID] }),
  );
}

function progress(text: string): void {
  const pm: ProgressMessage = { type: 'CN_PROGRESS', text };
  chrome.runtime.sendMessage(pm).catch(() => {
    /* popup 可能已关 */
  });
}

function finish(o: SaveOutcome): void {
  const rm: ResultMessage = { type: 'CN_RESULT', ...o };
  chrome.runtime.sendMessage(rm).catch(() => {
    /* popup 可能已关 */
  });
}

async function onSave(): Promise<{ notePath: string; skipped: number; total: number }> {
  const cfg = await getConfig();
  if (!cfg.server) throw new Error('请先在扩展设置里填写云简服务器地址');

  const tab = await activeTab();
  if (!tab || tab.id == null || tab.url == null) throw new Error('找不到当前标签页');
  if (!/^https?:\/\//i.test(tab.url)) {
    throw new Error('请在普通网页（http/https）上使用，不支持浏览器内置页面');
  }

  progress('正在加载与提取网页…');
  const resp = await extractFromTab(tab.id, {
    autoScroll: cfg.autoScroll,
    maxMs: cfg.autoScrollMaxMs,
  });
  if (!resp.ok) throw new Error(resp.error);
  const data = resp.data;

  const { req } = await makeAuth(cfg.server, cfg.password);
  const folder = cfg.folder || '网页剪藏';

  progress('准备目录…');
  await req((s, t) => createDir(s, t, folder));
  const tree = await req((s, t) => getTree(s, t));
  const existing = collectPaths(tree);
  const notePath = uniqueNotePath(existing, folder, sanitizeTitle(data.title));

  // 逐张抓取并上传图片：先 background 直接抓（带 cookie + 缓存优先），
  // 失败则回退到页面上下文抓（绕过登录/防盗链）。仍失败才跳过。
  const urlToRel = new Map<string, string>();
  const total = data.imageUrls.length;
  let idx = 0;
  let skipped = 0;
  for (const imgUrl of data.imageUrls) {
    idx += 1;
    progress(total > 0 ? `抓取/上传图片 ${idx}/${total}` : '处理中…');
    try {
      const blob = await fetchBlob(imgUrl, tab.id);
      const ext = pickExt(imgUrl, blob);
      if (!ALLOWED_EXTS.has(ext) || blob.size > MAX_BYTES) {
        skipped += 1;
        console.warn('[云简剪藏] 跳过(类型/大小)', ext, blob.size, imgUrl);
        continue;
      }
      const up = await req((s, t) => uploadAsset(s, t, notePath, blob, fileName(imgUrl, ext)));
      urlToRel.set(imgUrl, up.relPath);
    } catch (e) {
      skipped += 1; // 单张失败跳过，不中断整体
      console.warn('[云简剪藏] 跳过(抓取失败)', imgUrl, e);
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
  return { notePath, skipped, total };
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function extractFromTab(
  tabId: number,
  opts: { autoScroll: boolean; maxMs: number },
): Promise<ExtractResponse> {
  return chrome.tabs
    .sendMessage(tabId, { type: 'CN_EXTRACT', ...opts })
    .catch(() => {
      throw new Error('无法与页面通信：请刷新当前页面后重试（扩展刚安装/更新时，已打开的页面需刷新才会注入内容脚本）。');
    });
}

async function fetchBlob(url: string, tabId: number): Promise<Blob> {
  // 1) background 直接抓：主机权限 <all_urls> 可绕过 CORS 读取跨域响应。
  //    - 跨域图床（无 CORS 头）必须用 credentials:'omit'，否则「凭据 + 无 ACAO」会被挡，
  //      即便有主机权限也读不到（这是之前 tu.ewrewej.la 这类 CDN 全跳过的根因）。
  //    - 登录态同源图再用 'include' 兜一次（带会话 cookie）。
  //    - 不能用 cache:'force-cache'：跨域 <img> 的 no-cors 缓存是不透明响应（status=0 不可读）。
  for (const cred of ['omit', 'include'] as const) {
    try {
      const res = await fetch(url, { credentials: cred, cache: 'no-store' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0 && !blob.type.startsWith('text/html')) return blob;
      }
    } catch {
      /* 换一种 credentials 再试 / 落到下一层 */
    }
  }
  // 2) 在页面「主世界」抓：用页面自己的 fetch，带页面 Referer/cookie —— 绕过防盗链/登录的关键。
  //    （MV3 下 background 与内容脚本隔离世界的 fetch 发的是扩展 Referer，常被图床拦）
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: fetchImageInPage,
      args: [url],
    });
    const result = results[0]?.result;
    if (typeof result === 'string' && result.startsWith('data:')) {
      const r2 = await fetch(result);
      return await r2.blob();
    }
  } catch {
    /* 落到下一层 */
  }
  // 3) 内容脚本（隔离世界）兜底
  const r = (await chrome.tabs
    .sendMessage(tabId, { type: 'CN_FETCH_IMAGE', url })
    .catch(() => null)) as { ok: boolean; dataUrl?: string } | null;
  if (r?.ok && r.dataUrl) {
    const res2 = await fetch(r.dataUrl);
    return await res2.blob();
  }
  throw new Error('图片抓取失败');
}

/**
 * 在页面主世界执行（由 chrome.scripting.executeScript 注入）。
 * 用页面自己的 fetch（页面 Referer/cookie），抓 background 抓不到的图片，转 data URL 回传。
 * 必须自包含（不引用闭包/外部 import），因为注入时只取函数体。
 */
async function fetchImageInPage(url: string): Promise<string> {
  // 在页面主世界跑：带页面 Referer/cookie。配合 DNR 注入的 ACAO:* → 跨域图床也能读到字节。
  // 用 no-store 强制新请求（页面 <img> 的 no-cors 缓存是不透明、不可读的）。
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const type = res.headers.get('content-type') || 'image/gif';
  return `data:${type};base64,${btoa(bin)}`;
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
