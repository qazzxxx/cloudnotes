import { api } from '../api';

/**
 * 图片 URL 双向转换：
 * - Markdown 里存「笔记相对路径」（如 `assets/img.png`）——可移植，笔记移动时只要 assets 跟随就不断链；
 * - 编辑器渲染时用「带鉴权的绝对 URL」（`/api/fs/asset?path=…&token=…`）——<img src> 才能加载。
 * 加载时 ref→display；保存时 display→ref。token 不会写入磁盘。
 */

const EXTERNAL_RE = /^(?:https?:|data:|blob:|mailto:|tel:|#)/i;

/** 笔记相对路径 → 用于渲染的绝对 asset URL。 */
export function refToDisplayUrl(ref: string, noteDir: string): string {
  if (EXTERNAL_RE.test(ref)) return ref;
  const clean = ref.replace(/^\.\//, '').replace(/^\/+/, '');
  let rootRel: string;
  if (clean.startsWith('assets/')) {
    rootRel = noteDir ? `${noteDir}/assets/${clean.slice('assets/'.length)}` : clean;
  } else if (clean.includes('/assets/')) {
    rootRel = clean; // 已带目录前缀（根相对）
  } else {
    return ref; // 非附件，原样返回
  }
  return api.assetUrl(rootRel);
}

/** 渲染 URL → 笔记相对路径（用于序列化进 Markdown）。 */
export function displayUrlToRef(url: string, noteDir: string): string {
  if (!url.startsWith('/api/fs/asset?')) return url;
  try {
    const u = new URL(url, 'http://localhost');
    const rootRel = u.searchParams.get('path') ?? '';
    const prefix = noteDir ? `${noteDir}/` : '';
    return prefix && rootRel.startsWith(prefix) ? rootRel.slice(prefix.length) : rootRel;
  } catch {
    return url;
  }
}

interface UrlHaver {
  props?: { url?: string; [k: string]: unknown };
  children?: unknown;
}

/** 递归转换 blocks 中所有图片/附件 url（不改原对象，返回新数组）。 */
export function transformBlockUrls<T extends UrlHaver>(
  blocks: T[],
  fn: (url: string) => string,
): T[] {
  return blocks.map((b) => {
    const props =
      b.props && typeof b.props.url === 'string' ? { ...b.props, url: fn(b.props.url) } : b.props;
    const children = Array.isArray(b.children)
      ? transformBlockUrls(b.children as T[], fn)
      : b.children;
    return { ...b, props, children } as T;
  });
}

/** 取笔记所在目录（根目录返回 ''）。 */
export function noteDirOf(notePath: string): string {
  const i = notePath.lastIndexOf('/');
  return i === -1 ? '' : notePath.slice(0, i);
}

/** 笔记标题（去 .md）。 */
export function noteTitleOf(notePath: string): string {
  const name = notePath.slice(notePath.lastIndexOf('/') + 1);
  return name.replace(/\.md$/i, '');
}
