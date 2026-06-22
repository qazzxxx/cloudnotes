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

  // 从正文 HTML 收集图片 URL（去重、转绝对）
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const srcs = Array.from(tmp.querySelectorAll('img'))
    .map((i) => i.getAttribute('src') ?? '')
    .filter(Boolean);
  const imageUrls = Array.from(new Set(srcs.map((s) => toAbsolute(s))));

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  const markdown = turndown.turndown(html);

  return {
    title,
    markdown,
    imageUrls,
    url: location.href,
    byline: article?.byline?.trim() ?? '',
  };
}

function toAbsolute(src: string): string {
  try {
    return new URL(src, location.href).href;
  } catch {
    return src;
  }
}
