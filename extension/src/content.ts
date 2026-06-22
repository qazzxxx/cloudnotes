import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { ArticleData, ExtractResponse } from './lib/types';

/**
 * 内容脚本：仅在收到 background 的 CN_EXTRACT 消息时，才跑 Readability + Turndown。
 * 平时只挂一个轻量监听器，不在每个页面跑重逻辑。
 */
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  const msg = _msg as { type?: string };
  if (msg?.type !== 'CN_EXTRACT') return; // 非本脚本的消息，不处理
  extract()
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
