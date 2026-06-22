import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { ArticleData, ExtractResponse } from './lib/types';

/**
 * 内容脚本：仅在收到 background 的 CN_EXTRACT 消息时，才跑 Readability + Turndown。
 * 平时只挂一个轻量监听器，不在每个页面跑重逻辑。
 */
chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
  const msg = rawMsg as {
    type?: string;
    autoScroll?: boolean;
    maxMs?: number;
    url?: string;
  };
  // background 抓不到的图片，回退到页面上下文抓（同源 cookie + 正确 Referer，绕过登录/防盗链）
  if (msg?.type === 'CN_FETCH_IMAGE') {
    fetchImageAsDataUrl(msg.url ?? '')
      .then(
        (dataUrl) => sendResponse({ ok: true, dataUrl }),
        (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
    return true;
  }
  if (msg?.type !== 'CN_EXTRACT') return; // 非本脚本的消息，不处理
  (async () => {
    // 可选：先自动滚到底，触发无限滚动/懒加载，把完整内容（含懒图）都加载出来再提取
    if (msg.autoScroll) await autoScroll(msg.maxMs ?? 8000);
    return extract();
  })()
    .then(
      (data) => sendResponse({ ok: true, data } satisfies ExtractResponse),
      (e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        } satisfies ExtractResponse),
    );
  return true; // 异步 sendResponse
});

/** 在页面上下文抓取图片字节，转 data URL 回传给 background（用于跨域/防盗链图片的后备抓取）。 */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (!url) throw new Error('empty url');
  const res = await fetch(url, { credentials: 'include', cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // 分块转 base64，避免 String.fromCharCode 栈溢出
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const type = res.headers.get('content-type') || 'image/gif';
  return `data:${type};base64,${btoa(bin)}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 自动滚动页面：反复滚到底、等待加载，直到文档高度连续多次不再增长或超时。
 * 用于「滚动加载更多 / 无限瀑布流 / 论坛长帖懒加载图片」场景，确保 Readability 能拿到完整内容。
 * 结束后还原原滚动位置。
 */
async function autoScroll(maxMs: number): Promise<void> {
  if (!maxMs || maxMs <= 0) return;
  const start = Date.now();
  const originY = window.scrollY;
  let lastHeight = document.body.scrollHeight;
  let stable = 0;
  chrome.runtime.sendMessage({ type: 'CN_PROGRESS', text: '正在滚动加载完整内容…' }).catch(() => {});
  while (Date.now() - start < maxMs) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(550); // 等 AJAX / 图片触发
    const h = document.body.scrollHeight;
    if (h === lastHeight) {
      stable += 1;
      if (stable >= 2) break; // 连续两次无新增 → 认为到底了
    } else {
      stable = 0;
      lastHeight = h;
    }
  }
  // 滚动结束后再等一拍，让最后一批懒图开始下载（真正抓取在 background 的 fetch 阶段）
  await sleep(300);
  window.scrollTo(0, originY); // 还原用户原位置
  chrome.runtime.sendMessage({ type: 'CN_PROGRESS', text: '正在提取正文…' }).catch(() => {});
}

async function extract(): Promise<ArticleData> {
  const docClone = document.cloneNode(true) as Document;
  const article = new Readability(docClone).parse();
  const title = article?.title?.trim() || document.title.trim() || '未命名网页';
  const html = article?.content ?? '';

  if (!html) {
    return {
      title,
      markdown: '（无法提取正文：该页面可能需要登录、为特殊结构或纯 SPA。）',
      imageUrls: [],
      url: location.href,
      byline: '',
    };
  }

  // 解析正文 HTML，修正懒加载图片：src 常为占位图，真实地址在 data-* 上。
  // 必须在 Turndown 之前把 img.src 改成真实地址，否则正文里写的是占位图，
  // 与后台上传后回填的 assets/xxx 对不上 → 图片丢失。
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const realSrcs: string[] = [];
  for (const img of Array.from(tmp.querySelectorAll('img'))) {
    const real = pickRealSrc(img);
    if (real) {
      img.setAttribute('src', real);
      realSrcs.push(real);
    }
  }
  const imageUrls = Array.from(new Set(realSrcs.map((s) => toAbsolute(s))));

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  const markdown = turndown.turndown(tmp.innerHTML);

  return {
    title,
    markdown,
    imageUrls,
    url: location.href,
    byline: article?.byline?.trim() ?? '',
  };
}

/** 常见懒加载属性（按优先级），真实地址往往在这里而非 src。 */
const LAZY_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-actualsrc',
  'data-origin',
  'data-lazy',
  'data-img',
  'data-url',
];

/** 占位图判定：很小的 data: 内联图（透明占位）、或空。 */
function isPlaceholder(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith('data:') && u.length < 160) return true;
  return false;
}

/** 从一张 img 上找出真实图片地址：先查懒加载 data-* 属性，再 srcset，最后 src。 */
function pickRealSrc(img: HTMLImageElement): string | null {
  for (const attr of LAZY_ATTRS) {
    const v = img.getAttribute(attr);
    if (v && !isPlaceholder(v)) return v.trim();
  }
  // srcset / data-srcset：取第一个候选 URL
  const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-srcset');
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first && !isPlaceholder(first)) return first;
  }
  const src = img.getAttribute('src');
  if (src && !isPlaceholder(src)) return src.trim();
  return null;
}

function toAbsolute(src: string): string {
  try {
    return new URL(src, location.href).href;
  } catch {
    return src;
  }
}
