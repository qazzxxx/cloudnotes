import type { TreeNode } from './api';

// validateName 禁止的字符：< > : " | ? * / \ + 控制字符（0x00-0x1f、0x7f）。
// 扩展端先清洗成下划线，避免后端 400。（空格、连字符、中文等保留）
const FORBIDDEN_CHARS = '<>:"|?*\\/';
const RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** 把网页标题清洗成合法的笔记文件名（不含扩展名）。 */
export function sanitizeTitle(title: string): string {
  const isForbidden = (ch: string) =>
    FORBIDDEN_CHARS.includes(ch) || ch.charCodeAt(0) <= 0x1f || ch.charCodeAt(0) === 0x7f;
  let s = (title ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split('')
    .map((ch) => (isForbidden(ch) ? '_' : ch))
    .join('')
    .replace(/_+/g, '_')
    .replace(/^[_\s]+|[_\s]+$/g, '');
  if (!s) s = '未命名网页';
  if (RESERVED_RE.test(s)) s = `_${s}`;
  if (s.length > 100) s = s.slice(0, 100).trim();
  return s;
}

/** 在已有路径集合里给 baseName 找一个不冲突的 `${folder}/${base}.md`（必要时加 -2/-3）。 */
export function uniqueNotePath(existing: Set<string>, folder: string, baseName: string): string {
  const prefix = folder ? `${folder}/` : '';
  const candidate = (name: string) => `${prefix}${name}.md`;
  if (!existing.has(candidate(baseName))) return candidate(baseName);
  let n = 2;
  while (existing.has(candidate(`${baseName}-${n}`))) n += 1;
  return candidate(`${baseName}-${n}`);
}

/** 递归收集树里所有节点的 path（用于判断重名）。 */
export function collectPaths(nodes: TreeNode[]): Set<string> {
  const set = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      set.add(n.path);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return set;
}
